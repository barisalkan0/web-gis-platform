# GeoServer: SQL View + Dinamik Filtreleme + Isı Haritası (Heatmap)

Bu doküman hocanın 2. tur GeoServer ödevini (SQL View, `is_deleted` filtresi, `cql_filter`,
WMS/WFS ayrımı, Isı Haritası + Lejant) uygulamak için gereken **GeoServer admin panelinde
elle yapılacak adımları** anlatır. Kod tarafı (backend endpoint'i, frontend WMS/heatmap
entegrasyonu) zaten tamamlandı — bu dosyadaki adımlar olmadan kod çalışmaz, çünkü GeoServer'ın
kendisi bu ortamdan erişilemiyor, sadece admin arayüzünden elle yapılabilir.

## 0. Neden gerekiyor / mevcut durum

Proje daha önceki bir ödevde (bkz. Git geçmişi / `GeometryService.cs`, `GeoServerFeatureService.cs`)
GeoServer'a zaten bağlandı: `tbl_point` / `tbl_line` / `tbl_polygon` katmanları **düz tablo**
olarak (workspace: `basarsoft`) publish edilmiş durumda, `cql_filter` her istekte backend
tarafından üretilip (`is_deleted = false AND map_id = X AND ...`) gönderiliyor.

Bu turun istediği fark: `is_deleted = false` artık **SQL View'in kendi SQL'ine gömülü**
olmalı (katmanın statik/sabit bir parçası), `cql_filter` ise SADECE kullanıcı/harita bazlı
DİNAMİK filtreleme (map_id, is_private, inserted_user_id) için kullanılmaya devam etmeli.
İkisi birbirini dışlamıyor — SQL View zaten silinmiş kayıtları hiç göstermeyen bir taban,
`cql_filter` bunun ÜSTÜNE her istekte ek bir WHERE koşulu bindiriyor.

Katman adları (`tbl_point`/`tbl_line`/`tbl_polygon`) ve workspace adı (`basarsoft`)
DEĞİŞMEMELİ — kod bu isimlere sabit referans veriyor (`GeometryService.GeoServerLayerName`,
`GeoServerConfigController`, `MapPreviewLightbox.jsx`, `MapPage.jsx`).

## 1. Mevcut katmanları SQL View'e çevirme

GeoServer'da var olan bir "düz tablo" katmanını doğrudan SQL View'e çeviren bir buton yok —
en temiz yol: eski katmanı SİL (store'u değil, sadece layer'ı), aynı isimle SQL View olarak
yeniden yayınla.

Her üç katman için (`tbl_point`, `tbl_line`, `tbl_polygon`) aşağıdaki adımları tekrarla.

### 1.1. Eski katmanı kaldır

1. GeoServer admin panelinde **Layers** → `basarsoft:tbl_point` (örnek) → **Remove** (sadece
   layer'ı kaldırır, PostGIS store'a ve tabloya dokunmaz).

### 1.2. SQL View oluştur

1. **Layers** → **Add a new layer** → ilgili PostGIS store'unu seç (muhtemelen
   `basarsoft_staj` veya proje kurulumunda verdiğin isim).
2. Katman listesinin altında **"Configure new SQL view..."** linkine tıkla.
3. **View Name**: `tbl_point` (katman adı DEĞİŞMEMELİ).
4. **SQL statement** kutusuna aşağıdakini yapıştır (nokta katmanı için):

   ```sql
   SELECT id, geometry, place, province, name, color, category_id,
          is_deleted, inserted_date, is_active, inserted_user_id,
          modified_date, map_id, is_private
   FROM tbl_point
   WHERE is_deleted = false
   ```

   Çizgi katmanı (`tbl_line`) için View Name = `tbl_line`, SQL:

   ```sql
   SELECT id, geometry, place, province, name, color, category_id,
          is_deleted, inserted_date, is_active, inserted_user_id,
          modified_date, map_id, is_private
   FROM tbl_line
   WHERE is_deleted = false
   ```

   Alan katmanı (`tbl_polygon`) için View Name = `tbl_polygon`, SQL:

   ```sql
   SELECT id, geometry, place, province, name, color, category_id,
          is_deleted, inserted_date, is_active, inserted_user_id,
          modified_date, map_id, is_private
   FROM tbl_polygon
   WHERE is_deleted = false
   ```

5. **"Guess geometry type and srid"** veya elle: **Attribute** = `geometry`,
   **Type** = `Point` / `LineString` / `Polygon` (katmana göre), **SRID** = `4326`
   (proje WGS84 kullanıyor — bkz. `GeometryService.Srid`). **Regenerate SRS list** işaretli
   kalsın.
6. **Guess parameters from SQL** → sonra **Save**.
7. Açılan **Edit Layer** ekranında:
   - **Bounding Boxes**: "Compute from data" (ve "Compute from native bounds") ile hesaplat.
   - **Publishing** sekmesinde **Enabled** işaretli olsun.
   - **"Expose primary keys"** seçeneği bu ekranda GÖRÜNMEYEBİLİR (SQL View'lerde farklı yerde
     olabilir) — id kolonu zaten SELECT listesinde olduğu için backend'in `properties.id`
     okuması sorunsuz çalışır, `ExtractIdFromFid` yedek yoluna hiç düşülmemesi beklenir.
8. **Save**.

Bunu üç katman için de tekrarla.

### 1.3. Doğrulama

Tarayıcıdan (ya da Postman'den) şu WFS isteğini dene (backend'i atlayıp doğrudan GeoServer'a):

```
http://localhost:8080/geoserver/wfs?service=WFS&version=2.0.0&request=GetFeature&typeNames=basarsoft:tbl_point&outputFormat=application/json
```

Dönen `features` listesinde **silinmiş (`is_deleted=true`) hiçbir kayıt olmamalı** — SQL View
zaten bunları hiç döndürmüyor, `cql_filter` hiç eklenmese bile. Sonra uygulamayı (frontend)
açıp normal kullanım akışını (harita seçme, çizim görüntüleme, önizleme, paylaşılan harita)
test et — davranış ÖNCEKİYLE AYNI görünmeli, sadece güvenlik/filtreleme artık iki katmanlı.

## 2. `cql_filter` — değişen bir şey yok

Backend zaten her istekte `cql_filter` gönderiyor (`is_deleted = false AND map_id = X AND
(is_private = false OR inserted_user_id = Y)` şeklinde — bkz.
`src/BasarsoftStaj.Application/Services/GeoServerCqlFilterBuilder.cs`, hem WFS okuma yolunda
hem de yeni WMS config endpoint'inde AYNI yerden üretiliyor). SQL View'e geçtikten sonra bu
filtre **hâlâ aynen çalışmaya devam eder** — `cql_filter` SQL View'in ÜSTÜNE ek bir WHERE
gibi davranır, GeoServer ikisini birleştirir. Yani `is_deleted = false` artık iki kere
kontrol ediliyor (SQL View'de + cql_filter'da) — bu no-op bir tekrar, zararı yok, sadece
hocanın "SQL View içinde tanımlayın" isteğini de ayrıca karşılamış oluyoruz.

## 3. Isı Haritası (Heatmap) Style'ı yükleme

1. GeoServer admin panelinde **Styles** → **Add a new style**.
2. **Name**: `heatmap` (frontend WMS isteklerinde `STYLES=heatmap` gönderiyor — bu isim
   BİREBİR eşleşmeli).
3. **Workspace**: `basarsoft` seçilebilir (ya da global bırakılabilir, ikisi de çalışır).
4. **Format**: SLD.
5. Bu proje klasöründeki `docs/heatmap.sld` dosyasının içeriğini **"Copy style from an
   existing one"** yerine doğrudan editöre yapıştır (ya da "Upload a style file..." ile
   dosyayı seç).
6. **Validate** → hata vermemeli → **Save**.
7. **Layers** → `basarsoft:tbl_point` → **Publishing** sekmesi → **Additional Styles**
   listesine `heatmap`'i ekle (varsayılan style'ı DEĞİŞTİRME, ek bir seçenek olarak eklensin).
   **Save**.

### 3.1. Doğrulama

```
http://localhost:8080/geoserver/basarsoft/wms?service=WMS&version=1.1.0&request=GetMap&layers=basarsoft:tbl_point&styles=heatmap&bbox=25,35,45,43&width=600&height=400&srs=EPSG:4326&format=image/png&transparent=true
```

Bir PNG dönmeli (noktaların yoğun olduğu yerlerde renkli "sıcak" bölgeler, boş alanlarda
şeffaf). XML hata mesajı dönerse (`ServiceExceptionReport`) style adı/parametreleri kontrol
edilmeli.

### 3.2. Frontend tarafı (zaten kodlandı, sadece bilgi amaçlı)

Uygulamada araç çubuğunda **"🔥 Isı Haritası Analizi"** butonu var (Envanter Analizi'nin
yanında, aynı izinle — `UseAnalysisTool`). Açılınca:

- Backend'den (`GET /api/GeoServerConfig/{mapId}`) o haritaya özel `cql_filter` + GeoServer
  bağlantı bilgileri çekilir.
- Tarayıcı DOĞRUDAN GeoServer'ın WMS'ine (`.../basarsoft/wms?...&styles=heatmap&cql_filter=...`)
  istek atar — backend sadece yetki/filtre üretimi için araya giriyor, resmin kendisi
  backend'den geçmiyor (hocanın "genel gösterimde WMS" isteğine uygun).
- Sağ altta beliren lejant (`HEATMAP_COLOR_STOPS`, `MapPage.jsx`) bu SLD'deki renk
  duraklarıyla BİREBİR aynı — biri değişirse diğeri de güncellenmeli, yoksa lejant yanlış
  bilgi verir.

## 4. WMS/WFS ayrımı — hangi ekran hangisini kullanıyor

| Ekran | Servis | Neden |
|---|---|---|
| Ana harita (kendi haritanı düzenleme, çizim/silme/seçme) | WFS (vektör, tıklanabilir feature'lar) | "çizim/etkileşim" — hocanın WFS için istediği tam olarak bu |
| Paylaşılan haritayı görüntüleme (view-only ama feature'a tıklayıp bilgi kartı açma) | WFS | Tıklanabilir feature bilgisi (attribute popup) hâlâ gerekiyor, salt gösterim değil |
| Harita önizleme lightbox'ı (switcher'da haritanın üzerine gelince açılan küçük harita) | **WMS** | Sadece pan/zoom, tıklanabilir feature YOK — "genel gösterim" |
| Isı Haritası Analizi | **WMS** | Zaten sunucu tarafında üretilen bir raster, WFS ile hiç ilgisi yok |

## 5. Migration / kod tarafında ekstra bir şey gerekmiyor

Bu turun kod değişiklikleri sadece yeni dosyalar/endpoint (`GeoServerConfigController`,
`GeoServerCqlFilterBuilder`) ve frontend değişiklikleri — yeni bir DB tablosu/kolonu YOK,
migration gerekmiyor. `dotnet build` ile derleyip GeoServer taraflı adımları tamamladıktan
sonra test edilebilir.
