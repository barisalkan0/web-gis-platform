<?xml version="1.0" encoding="UTF-8"?>
<!-- tbl_point-colored.sld ile AYNI gerekçe/deseni — bkz. o dosyadaki açıklama. Yükleme:
     GeoServer > Layers > tbl_line > Publishing > Additional Styles, style adı
     "tbl_line_colored" OLMALI. -->
<StyledLayerDescriptor version="1.0.0"
  xmlns="http://www.opengis.net/sld"
  xmlns:ogc="http://www.opengis.net/ogc"
  xmlns:xlink="http://www.w3.org/1999/xlink"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://www.opengis.net/sld http://schemas.opengis.net/sld/1.0.0/StyledLayerDescriptor.xsd">
  <NamedLayer>
    <Name>tbl_line_colored</Name>
    <UserStyle>
      <Title>Çizgi (kayıt rengiyle)</Title>
      <FeatureTypeStyle>
        <Rule>
          <LineSymbolizer>
            <Stroke>
              <CssParameter name="stroke">
                <ogc:PropertyName>color</ogc:PropertyName>
              </CssParameter>
              <CssParameter name="stroke-width">3</CssParameter>
              <CssParameter name="stroke-linecap">round</CssParameter>
            </Stroke>
          </LineSymbolizer>
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
              <LinePlacement />
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
