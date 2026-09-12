# Harita Önizlemesi (hover) Renklendirme Kurulumu

"Haritalarım" listesinde bir haritanın üzerine gelince açılan küçük önizleme (`MapPreviewLightbox.jsx`) GeoServer'ın WMS servisinden hazır bir raster görüntü istiyor (bkz. `docs/geoserver-sql-view-ve-heatmap.md`'deki AYNI mimari karar — "genel gösterimlerde WMS tercih edin" hoca ödevi).

**Sorun:** `tbl_point`/`tbl_line`/`tbl_polygon` katmanlarına bugüne kadar hiç özel bir style yüklenmemişti. WMS isteğinde `STYLES` parametresi boş bırakılınca GeoServer kendi jenerik varsayılan stilini kullanıyor — bu da poligonlar için düz, tek renk gri dolgu demek (kayıt renkleri, isimler, şeffaflık hiç görünmüyordu).

**Çözüm:** `docs/tbl_point-colored.sld`, `docs/tbl_line-colored.sld`, `docs/tbl_polygon-colored.sld` — her feature'ın kendi `color` sütununu kullanan, `name` sütununu etiket olarak basan, ve etiketler iç içe geçtiğinde otomatik olarak sadece birini gösteren (`conflictResolution`) 3 ayrı SLD dosyası eklendi. Frontend artık WMS isteğine `STYLES=tbl_point_colored` (vb.) parametresini de ekliyor — **ama bu style'lar GeoServer'a önceden yüklenmemişse istek hataya düşer**, önizleme "Yükleniyor…" durumunda takılı kalabilir veya boş gelebilir.

## Kurulum adımları (GeoServer arayüzünden, her katman için tekrarlanır)

1. GeoServer admin paneline girin → **Layers** → `tbl_point` (sonra sırayla `tbl_line`, `tbl_polygon`).
2. **Publishing** sekmesine geçin.
3. **Additional Styles** bölümünden ilgili SLD dosyasını ("Choose File" ile `docs/tbl_point-colored.sld` vb.) seçip yükleyin. Style adının dosyanın içindeki `<Name>` etiketiyle BİREBİR aynı olduğundan emin olun (`tbl_point_colored`, `tbl_line_colored`, `tbl_polygon_colored`) — frontend bu isimleri sabit olarak gönderiyor.
4. Kaydedin, üç katman için de tekrarlayın.
5. Bir haritanın üzerine gelip önizlemeyi kontrol edin: artık her kaydın kendi rengiyle, ~%20 şeffaf dolguyla ve (varsa) ismiyle görünmeli.

Bu adım tamamlanana kadar önizleme ya eski (gri) haline dönebilir ya da hiç yüklenemeyebilir — heatmap.sld'de olduğu gibi, bu SLD'lerin GeoServer'a manuel yüklenmesi gerekiyor, kod tarafından otomatik yapılamıyor.
