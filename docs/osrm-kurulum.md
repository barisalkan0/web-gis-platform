# OSRM: Docker ile Yerel Kurulum ve Otomatik Rota Üretimi

Bu doküman hocanın 27 Ağustos ödevindeki **"OSRM ile Otomatik Rota Üretimi"** maddesi için
gereken **Docker üzerinde OSRM'i ayağa kaldırma** adımlarını anlatır. Kod tarafı (backend'in
`IOsrmService`/`OsrmService` üzerinden OSRM'e HTTP isteği atması, admin panelindeki "🛣️ Rota
Oluştur" butonu, durak sırası/seti değişince otomatik yeniden hesaplama, haritada yön okları)
zaten tamamlandı — bu dosyadaki adımlar olmadan "Rota Oluştur" butonu **"OSRM sunucusuna
ulaşılamadı" hatası** verir, çünkü OSRM bu ortamdan (sandbox) erişilemiyor, sadece senin kendi
bilgisayarında Docker ile ayağa kaldırılabiliyor.

## 0. Neden gerekiyor / mevcut durum

Ödev metni: *"Rota hesaplamaları için OSRM (Open Source Routing Machine) kullanın (Docker
üzerinde localde çalıştırıp HTTP istekleri atmanız tercih edilmektedir)."* Proje bunu
`docs/geoserver-kurulum.md`/`docs/geoserver-poi-entegrasyonu.md`'deki GeoServer entegrasyonuyla
**BİREBİR AYNI mimari desenle** uyguladı: `IGeoServerFeatureService` ile aynı şekilde,
`AddHttpClient<IOsrmService, OsrmService>()` ile DI'a kayıtlı, `appsettings.json`'daki
`Osrm:BaseUrl` adresine HTTP GET atan ince bir servis (`src/BasarsoftStaj.Application/Services/
OsrmService.cs`).

`appsettings.json`'daki varsayılan ayar:

```json
"Osrm": {
  "BaseUrl": "http://localhost:5000",
  "Profile": "driving"
}
```

OSRM Docker'da bu adreste (5000 portu) ayakta değilse, "Rota Oluştur" butonuna basınca backend
kullanıcıya açıkça *"OSRM sunucusuna ulaşılamadı. Docker'da çalıştığından emin olun"* hatası
döner — GeoServer entegrasyonundaki gibi sessizce eski/bayat veriyle devam ETMEZ.

## 1. Docker'ı kur (yoksa)

[docker.com/get-started](https://www.docker.com/get-started) üzerinden Docker Desktop'ı indirip
kur, kurulum bitince `docker --version` komutunun çalıştığını doğrula.

## 2. Türkiye yol ağı verisini indir (OSM extract)

OSRM'in yol ağını hesaplayabilmesi için bir `.osm.pbf` dosyasına ihtiyacı var. Geofabrik'in
Türkiye extract'ini kullan (test/staj amaçlı; tüm ülkeyi işlemek CPU/RAM açısından biraz zaman
alabilir — istersen tek bir il/bölge extract'i de aynı adımlarla kullanılabilir):

```
https://download.geofabrik.de/europe/turkey-latest.osm.pbf
```

İndirilen dosyayı bir çalışma klasörüne koy, örn. `C:\osrm-data\turkey-latest.osm.pbf`.

## 3. Yol ağını OSRM formatına dönüştür (bir kere yapılır)

Windows'ta PowerShell'de, indirilen dosyanın bulunduğu klasörde çalıştır (`car.lua` profili,
`Profile: driving` ayarıyla eşleşiyor — appsettings'teki `Osrm:Profile` değerini değiştirirsen
buradaki profili de değiştir, örn. yürüyüş için `foot.lua`, bisiklet için `bicycle.lua`):

```powershell
cd C:\osrm-data

docker run -t -v "${PWD}:/data" osrm/osrm-backend osrm-extract -p /opt/car.lua /data/turkey-latest.osm.pbf
docker run -t -v "${PWD}:/data" osrm/osrm-backend osrm-partition /data/turkey-latest.osrm
docker run -t -v "${PWD}:/data" osrm/osrm-backend osrm-customize /data/turkey-latest.osrm
```

Bu üç adım (extract → partition → customize) sadece **veri/profil değişince bir kere**
çalıştırılır — sonuçlar `turkey-latest.osrm*` dosyalarına yazılır, sunucuyu her başlatışında
tekrar etmene gerek yok.

## 4. OSRM sunucusunu başlat

```powershell
docker run -t -i -p 5000:5000 -v "${PWD}:/data" osrm/osrm-backend osrm-routed --algorithm mld /data/turkey-latest.osrm
```

`-p 5000:5000` — appsettings.json'daki `Osrm:BaseUrl` (`http://localhost:5000`) ile eşleşiyor;
başka bir port kullanırsan appsettings'i de güncelle ve backend'i yeniden başlat.

### 4.1. Doğrulama

Tarayıcıda veya `curl` ile (İstanbul içinde iki nokta örneği, `lon,lat` sırasıyla):

```
http://localhost:5000/route/v1/driving/28.9784,41.0082;29.0610,41.0766?overview=full&geometries=geojson
```

Dönen JSON'da `"code": "Ok"` ve `routes[0].geometry.coordinates` altında bir koordinat listesi
görmelisin. Bu adım çalışmadan uygulamadaki "Rota Oluştur" butonu da çalışmaz.

## 5. Uygulamada dene

1. Backend'i başlat (`dotnet run`, `http://localhost:5276`) — OSRM Docker'da ayakta olmalı.
2. Admin panelinde **Güzergah Yönetimi** sekmesinde bir güzergaha en az 2 aktif (duraklatılmamış)
   durak ekle.
3. Güzergah kartındaki **🛣️ Rota Oluştur** butonuna bas. Başarılı olursa kart üzerinde son
   oluşturma zamanı (🛣️ tarih) görünür ve haritada güzergah artık gerçek yol ağını takip eden,
   üzerinde yön okları olan bir çizgiyle çizilir.
4. Bir durak ekleyip/silip/sırasını değiştirip OSRM rotasının **otomatik yeniden hesaplandığını**
   doğrula (backend `TransitStopService.RegenerateRouteIfNeededAsync` — sadece daha önce en az
   bir kez "Rota Oluştur" ile OSRM rotası üretilmiş güzergahlarda devreye girer).

## 6. Sık karşılaşılan sorunlar

- **"OSRM sunucusuna ulaşılamadı"**: Docker container'ı ayakta değil veya port farklı — adım 4'ü
  tekrar kontrol et.
- **"OSRM rota hesaplayamadı (bu duraklar arasında yol bulunamadı olabilir)"**: durakların
  konumu indirilen extract'in kapsadığı bölgenin dışında (örn. Türkiye extract'i kullanıp
  yurt dışında bir test noktası denemek) ya da nokta bir yoldan çok uzakta (örneğin deniz
  ortasında) olabilir.
- **`osrm-extract`/`osrm-partition` çok uzun sürüyor**: tüm Türkiye yerine daha küçük bir
  bölge/il extract'i (Geofabrik'te alt bölgeler de var) kullanmak test için yeterli ve çok
  daha hızlıdır.
