<?xml version="1.0" encoding="UTF-8"?>
<!--
  Kullanıcının kendi bildirdiği bug (Haritalarım listesinde bir haritanın üzerine gelince
  açılan önizleme, bkz. frontend/src/components/MapPreviewLightbox.jsx): "önizleme
  görüntüsündeki alanlar solid gri renk olmuş... şeffaflık ve renkler falan olduğu gibi kalsa
  olmaz mı hatta isimleri de görünse". Kök neden: tbl_point/tbl_line/tbl_polygon katmanlarına
  bugüne kadar HİÇ özel bir style yüklenmemişti (sadece heatmap.sld ve POI kategori SLD'leri
  vardı) - GeoServer, style verilmeyince kendi jenerik varsayılan stilini (tek düz gri) kullanır.

  Bu SLD, ana haritadaki (MapPage.jsx, client-side OL Style) AYNI mantığı GeoServer tarafında
  tekrarlıyor: her feature'ın KENDİ "color" sütunundaki rengini kullanıyor (ogc:PropertyName),
  sabit bir renk DEĞİL. "name" sütunu varsa etiket olarak gösteriliyor; conflictResolution=true
  sayesinde GeoServer birbirine çok yakın/iç içe etiketleri OTOMATİK gizleyip sadece birini
  gösteriyor (kullanıcının kendi isteği: "uzaktan birden fazla isim iç içeyse birini göstersin").

  Yükleme: GeoServer > Layers > tbl_point > Publishing sekmesi > "Additional Styles" listesine
  bu dosyayı ekleyin, style adı "tbl_point_colored" OLMALI (frontend WMS isteğinde
  STYLES=tbl_point_colored gönderiyor, bkz. MapPreviewLightbox.jsx).
-->
<StyledLayerDescriptor version="1.0.0"
  xmlns="http://www.opengis.net/sld"
  xmlns:ogc="http://www.opengis.net/ogc"
  xmlns:xlink="http://www.w3.org/1999/xlink"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://www.opengis.net/sld http://schemas.opengis.net/sld/1.0.0/StyledLayerDescriptor.xsd">
  <NamedLayer>
    <Name>tbl_point_colored</Name>
    <UserStyle>
      <Title>Nokta (kayıt rengiyle)</Title>
      <FeatureTypeStyle>
        <Rule>
          <PointSymbolizer>
            <Graphic>
              <Mark>
                <WellKnownName>circle</WellKnownName>
                <Fill>
                  <CssParameter name="fill">
                    <ogc:PropertyName>color</ogc:PropertyName>
                  </CssParameter>
                </Fill>
                <Stroke>
                  <CssParameter name="stroke">#ffffff</CssParameter>
                  <CssParameter name="stroke-width">1.5</CssParameter>
                </Stroke>
              </Mark>
              <Size>9</Size>
            </Graphic>
          </PointSymbolizer>
          <TextSymbolizer>
            <Label>
              <ogc:PropertyName>name</ogc:PropertyName>
            </Label>
            <Font>
              <CssParameter name="font-family">sans-serif</CssParameter>
              <CssParameter name="font-size">11</CssParameter>
              <CssParameter name="font-weight">bold</CssParameter>
            </Font>
            <LabelPlacement>
              <PointPlacement>
                <Displacement>
                  <DisplacementY>12</DisplacementY>
                </Displacement>
              </PointPlacement>
            </LabelPlacement>
            <Halo>
              <Radius>2</Radius>
              <Fill>
                <CssParameter name="fill">#ffffff</CssParameter>
                <CssParameter name="fill-opacity">0.85</CssParameter>
              </Fill>
            </Halo>
            <Fill>
              <CssParameter name="fill">#111827</CssParameter>
            </Fill>
            <VendorOption name="conflictResolution">true</VendorOption>
            <VendorOption name="spaceAround">3</VendorOption>
          </TextSymbolizer>
        </Rule>
      </FeatureTypeStyle>
    </UserStyle>
  </NamedLayer>
</StyledLayerDescriptor>
