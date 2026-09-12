# Ankara Gerçek Veri Seti — İçe Aktarma Rehberi

Bu dosyadaki iki veri seti de **OpenStreetMap'ten (Overpass API) canlı çekilmiş gerçek
veridir**; uydurma/sentetik kayıt yoktur. Kapsanan alan: Ankara şehir merkezi ve çevresi
(bbox `39.75,32.55 – 40.05,33.05`), toplu taşıma için ise il geneli.

---

## 1. POI verisi — `docs/ankara-poi-osm-genis.json` (8.764 kayıt)

| Kategori | Adet | | Kategori | Adet |
|---|---:|---|---|---:|
| Eczane | 1.575 | | Banka | 469 |
| Park & Bahçe | 1.133 | | Benzin İstasyonu | 245 |
| Süpermarket | 960 | | Giyim Mağazası | 228 |
| Okul | 841 | | Pastane & Fırın | 184 |
| Cami | 743 | | Hastane | 119 |
| Restoran | 716 | | Metro & Tren İstasyonu | 91 |
| Kafe | 669 | | Alışveriş Merkezi | 89 |
| Fast Food | 484 | | Üniversite | 87 |
| | | | Spor Salonu / Müze / Sinema | 57 / 53 / 21 |

Zincirler bu setin içinde: Burger King, McDonald's, Domino's gibi markalar **Fast Food**
altında; BİM, A101, Şok, Migros, CarrefourSA **Süpermarket** altında; Ankamall, Panora,
Kentpark, Cepa **Alışveriş Merkezi** altında geliyor.

### Nasıl içe aktarılır

1. Yönetim Paneli → **POI Yönetimi** sekmesi.
2. **📥 Toplu POI İçe Aktar** butonuna bas.
3. `docs/ankara-poi-osm-genis.json` dosyasının tamamını kopyalayıp kutuya yapıştır.
4. **İçe Aktar**.

Notlar:

- Kategoriler yoksa otomatik oluşturulur (`parentCategoryName` → `categoryName` hiyerarşisiyle).
- Aynı isim + ~150 m yakınlıktaki POI'ler **atlanır**, kopya oluşmaz — yani içe aktarmayı
  tekrar çalıştırmak güvenlidir.
- 8.764 satır tek tek POST edildiği için işlem **birkaç dakika sürer**; sekmeyi kapatma.
  İstersen dosyayı ikiye bölüp iki turda aktarabilirsin.

---

## 2. Toplu taşıma hatları — `docs/ankara-toplu-tasima-hatlari.json` (6 hat, 83 durak)

| Hat | Durak | Renk |
|---|---:|---|
| M1 Kızılay→Batıkent Metro | 12 | kırmızı |
| M2 Koru→Kızılay Metro | 12 | kırmızı |
| M3 Batıkent→OSB Törekent Metro | 12 | kırmızı |
| M4 Kızılay→Şehitler/Gazino Metro | 12 | sarı |
| Ankaray AŞTİ→Dikimevi | 11 | yeşil |
| Başkentray Kayaş-Sincan | 24 | turkuaz |

Her hat, OSM'deki **gerçek ray geometrisini** `pathWkt` alanında taşıyor. Bu yüzden içe
aktardıktan sonra ayrıca "Rota Oluştur" (OSRM) çalıştırmaya **gerek yok** — OSRM karayolu
ağında çalıştığı için metro/tramvay hatlarını zaten yanlış çizerdi.

### Nasıl içe aktarılır

1. Yönetim Paneli → **Ulaşım / Güzergahlar** bölümü.
2. **📥 Toplu Hat İçe Aktar** butonuna bas.
3. `docs/ankara-toplu-tasima-hatlari.json` içeriğini yapıştır → **İçe Aktar**.

Akış: her hat için `POST /api/TransitRoute` → durakları sırayla `POST /api/TransitStop` →
`PATCH /api/TransitRoute/{id}/path` (gerçek geometri). Aynı isimli hat zaten varsa atlanır.

### Neden sadece bu 6 hat?

- Her hattın OSM'de iki yönü (yol 1 / yol 2) ayrı relation olarak duruyor; harita
  kalabalıklaşmasın diye **tek yön** alındı.
- Şehirlerarası YHT/ekspres hatları (Ankara–İstanbul, Ankara–Sivas…) haritanın yarısını
  kaplayacağı için dışarıda bırakıldı.
- **Otobüs/minibüs hatları alınmadı**: EGO'nun otobüs hatları OSM'de eksik ve tutarsız
  etiketlenmiş durumda; ayrıca yüzlerce hat × onlarca durak tek tek POST edileceği için
  içe aktarma çok uzun sürerdi. Sefer *saatleri* zaten hiçbir açık kaynakta makine
  okunabilir formatta yok (EGO'nun GTFS/API yayını yok).

---

## Veriyi yeniden üretmek / genişletmek

Veri Overpass API'den şu kalıpla çekildi (kategori başına bir sorgu):

```
[out:json][timeout:25];
nwr["amenity"="restaurant"](39.75,32.55,40.05,33.05);
out center;
```

Toplu taşıma için:

```
[out:json][timeout:60];
rel["type"="route"]["route"~"^(subway|tram|light_rail|train)$"](39.70,32.40,40.15,33.15);
out geom;
```

Sonuçlar `{ name, categoryName, parentCategoryName, province, district, lat, lon }` biçimine
dönüştürülüp yukarıdaki dosyalara yazıldı. Overpass ücretsiz sunucuları sık sık 429/504
döndürüyor; ayna sunucular (`overpass.kumi.systems`, `overpass.private.coffee`) sırayla
denenerek ve sorgular arasında bekleyerek çekmek gerekiyor.
