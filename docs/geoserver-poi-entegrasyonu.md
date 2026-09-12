# GeoServer: POI Entegrasyonu ve Kategori Bazlı Stiller

Bu doküman hocanın "GeoServer POI Entegrasyonu ve Stilleme" ödevini uygulamak için gereken
**GeoServer admin panelinde elle yapılacak adımları** anlatır. Kod tarafı (backend'in `poi`
katmanını GeoServer WFS üzerinden okuması, kategori bazlı SLD üretim script'i, haritadaki
zoom'a bağlı isim etiketi) zaten tamamlandı — bu dosyadaki adımlar olmadan POI'ler haritada
**görünmez olur** (backend, GeoServer'daki `poi` katmanına istek atıp hata alır), çünkü
GeoServer bu ortamdan erişilemiyor, sadece admin arayüzünden elle yapılabiliyor.

## 0. Neden gerekiyor / mevcut durum

Proje daha önce `tbl_point`/`tbl_line`/`tbl_polygon` için AYNI entegrasyonu yaptı (bkz.
`docs/geoserver-kurulum.md`, `docs/geoserver-sql-view-ve-heatmap.md`). POI için de birebir
aynı desen tekrarlanıyor: backend artık POI listesini (haritada gösterilen tek uç nokta,
`GET /api/Poi/catalog`) doğrudan veritabanından değil GeoServer'ın WFS servisinden çekiyor
(`PoiService.GetCatalogItemsFromGeoServerAsync`, bkz. kod yorumları). Yazma (ekleme/güncelleme/
silme) hâlâ EF Core üzerinden doğrudan veritabanına gidiyor — ödev "veri getirme"den
bahsediyor, GeoServer'ın PostGIS store'u tabloyu canlı okuduğu için ekstra senkronizasyon
gerekmiyor.

**appsettings.json'daki `GeoServer:Enabled` `false` yapılırsa** (GeoServer o an ayakta değilse)
eski repository yolu kullanılır — bu ayarı hızlı yerel debug için kullanabilirsin, ama bu
dosyadaki adımları tamamlamadan `true`/varsayılan bırakırsan POI listesi boş/hatalı döner.

## 1. `poi` tablosunu SQL View olarak katman ekleme

`tbl_point` ile AYNI SQL View + `is_deleted = false` deseni kullanılıyor (bkz.
`docs/geoserver-sql-view-ve-heatmap.md` bölüm 1) — POI için de en baştan SQL View olarak
yayınla, sonradan düz tablodan çevirmene gerek kalmasın.

1. GeoServer admin panelinde **Layers** → **Add a new layer** → projenin PostGIS store'unu seç.
2. Katman listesinin altındaki **"Configure new SQL view..."** linkine tıkla.
3. **View Name**: `poi` (backend bu isme sabit referans veriyor —
   `PoiService.GeoServerLayerName` — DEĞİŞTİRME).
4. **SQL statement**:

   ```sql
   SELECT id, geometry, name, category_id, working_hours, note, province, district,
          icon, user_id, map_id, is_active, is_deleted, created_date
   FROM poi
   WHERE is_deleted = false
   ```

   (`icon`: kullanıcının kendi isteğiyle sonradan eklenen, POI'ye özel ikon override'ı —
   bkz. `Poi.Icon`. SQL View'i daha önce `icon` olmadan kurduysan View'i düzenleyip bu
   sütunu SELECT listesine ekle, aksi halde backend'in GeoServer'dan okuduğu POI'lerde
   ikon her zaman kategori/varsayılan değere düşer.)

5. **Attribute** = `geometry`, **Type** = `Point`, **SRID** = `4326`.
6. **Guess parameters from SQL** → **Save**.
7. Açılan **Edit Layer** ekranında **Bounding Boxes**'i "Compute from data" ile hesaplat,
   **Publishing** sekmesinde **Enabled** işaretli olsun → **Save**.

### 1.1. Doğrulama

```
http://localhost:8080/geoserver/wfs?service=WFS&version=2.0.0&request=GetFeature&typeNames=basarsoft:poi&outputFormat=application/json
```

Dönen `features` listesinde eklediğin test POI'leri görünmeli, `is_deleted=true` olan hiçbir
kayıt olmamalı. Sonra uygulamayı açıp haritanın POI katalog isteğinin (`GET /api/Poi/catalog`)
artık 200 döndüğünü ve POI'lerin haritada göründüğünü doğrula.

## 2. Kategori bazlı Style (SLD) — otomatik üretim

Kategoriler admin panelinden dinamik eklenip silindiği için SLD'leri elle tek tek yazmak
yerine bir script bunları üretiyor: `scripts/generate-poi-category-slds.js`.

1. Backend'in çalıştığını doğrula (`dotnet run`, `http://localhost:5276`).
2. Proje kökünden çalıştır:

   ```
   node scripts/generate-poi-category-slds.js
   ```

   Bu, `docs/geoserver-poi-styles/` altına her kategori için bir `.sld` dosyası üretir
   (`poi-category-<id>.sld`) + kategorisiz POI'ler için `poi-none.sld`. Renk paleti,
   `frontend/src/pages/MapPage.jsx`'teki `POI_CATEGORY_COLOR_PALETTE` ile BİREBİR aynı —
   haritadaki ikon rengiyle GeoServer'ın style'ı çakışmasın diye.

3. Üretilen her `.sld` dosyasını GeoServer admin panelinden elle yükle:
   - **Styles** → **Add a new style**.
   - **Name**: dosya adıyla AYNI (ör. `poi-category-3`).
   - **Workspace**: `basarsoft`.
   - **Format**: SLD, dosyanın içeriğini yapıştır veya "Upload a style file..." ile seç.
   - **Validate** → hata vermemeli → **Save**.
4. **Layers** → `basarsoft:poi` → **Publishing** sekmesi → **Additional Styles** listesine
   ürettiğin TÜM stilleri ekle (varsayılan style'ı değiştirme) → **Save**.

Alternatif: GeoServer admin kullanıcı adı/şifresini ortam değişkeni olarak verip script'i
`--upload` bayrağıyla çalıştırırsan (`GEOSERVER_ADMIN_USER=admin GEOSERVER_ADMIN_PASSWORD=...
node scripts/generate-poi-category-slds.js --upload`) 3. adımdaki elle yükleme otomatik
yapılır, sadece 4. adım (Additional Styles'a ekleme) elle kalır.

**Yeni bir POI kategorisi eklediğinde/sildiğinde bu script'i tekrar çalıştır** — otomatik
olarak yeni kategoriler için stil üretir, silinenler için üretmez (GeoServer'daki eski
stili elle silmen gerekir, otomatik silme yapılmıyor — yanlışlıkla hâlâ kullanılan bir
stili silmeyelim diye bilinçli olarak böyle).

### 2.1. Doğrulama (tek bir kategori için WMS testi)

```
http://localhost:8080/geoserver/basarsoft/wms?service=WMS&version=1.1.0&request=GetMap&layers=basarsoft:poi&styles=poi-category-1&bbox=25,35,45,43&width=600&height=400&srs=EPSG:4326&format=image/png&transparent=true
```

Bir PNG dönmeli; sadece o kategorideki POI'ler, script'in ürettiği renkte nokta olarak
görünmeli. `styles` parametresini farklı kategori id'leriyle değiştirip her stili ayrı ayrı
test edebilirsin.

## 3. Haritada POI isimlerinin zoom'a bağlı görünmesi

Bu kısım GeoServer'da DEĞİL, doğrudan haritanın kendi interaktif katmanında (OpenLayers)
çözüldü — POI'ler zaten tıklanabilir vektör feature'lar olarak render ediliyor (WMS raster
değil), bu yüzden zoom kontrolü client-side yapmak hem daha basit hem daha performanslı.
`MapPage.jsx`'teki `buildPoiLayerStyle` fonksiyonu artık `resolution` parametresini alıp
`POI_LABEL_MAX_RESOLUTION` (≈ zoom 14) eşiğinin altına inince ismi gösteriyor, üstündeyken
sadece ikonu gösteriyor. GeoServer'a yüklenen SLD'lerdeki `MaxScaleDenominator` kuralı da
AYNI eşiğin GeoServer WMS karşılığı — eğer bu SLD'leri başka bir yerde (ör. ileride bir WMS
önizleme/rapor ekranında) kullanırsan orada da aynı davranış geçerli olur.

## 4. Migration / kod tarafında ekstra bir şey gerekmiyor

Bu ödevin kod değişiklikleri sadece okuma yolunu değiştiriyor (`PoiService`,
`GeoServerFeatureService`) ve yeni bir script/doküman ekliyor — yeni bir DB tablosu/kolonu
YOK, migration gerekmiyor. `dotnet build` ile derleyip yukarıdaki GeoServer adımlarını
tamamladıktan sonra test edilebilir.
