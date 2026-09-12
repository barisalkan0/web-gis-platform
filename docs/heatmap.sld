<?xml version="1.0" encoding="UTF-8"?>
<!--
  Isı Haritası (Heatmap) Style - GeoServer'ın "vec:Heatmap" render transformation'ını kullanır.
  Bu dosya tbl_point katmanına EK bir style olarak yüklenmeli (varsayılan nokta style'ının
  YERİNE değil) - GeoServer Layer > Publishing sekmesinde "Additional Styles" listesine
  eklenir, adı "heatmap" olarak KALMALI (frontend WMS isteklerinde STYLES=heatmap gönderiyor,
  bkz. frontend/src/pages/MapPage.jsx HEATMAP_COLOR_STOPS ve toggleHeatmap civarı).

  ColorMap'teki renk/eşik değerleri frontend'deki HEATMAP_COLOR_STOPS sabitiyle BİREBİR AYNI
  olacak şekilde seçildi - biri değişirse diğeri de güncellenmeli, yoksa lejant ile haritadaki
  gerçek renkler uyuşmaz.

  quantity=0 girdisindeki opacity="0": çok düşük yoğunluklu (neredeyse boş) alanlar tamamen
  şeffaf kalsın diye - tüm haritayı düz maviyle boyamaması için bilinçli bir tercih, GeoServer'ın
  kendi örnek dokümantasyonundaki standart pratik.
-->
<StyledLayerDescriptor version="1.0.0"
  xmlns="http://www.opengis.net/sld"
  xmlns:ogc="http://www.opengis.net/ogc"
  xmlns:xlink="http://www.w3.org/1999/xlink"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://www.opengis.net/sld http://schemas.opengis.net/sld/1.0.0/StyledLayerDescriptor.xsd">
  <NamedLayer>
    <Name>heatmap</Name>
    <UserStyle>
      <Title>Isı Haritası (Heatmap)</Title>
      <FeatureTypeStyle>
        <Transformation>
          <ogc:Function name="vec:Heatmap">
            <ogc:Function name="parameter">
              <ogc:Literal>data</ogc:Literal>
            </ogc:Function>
            <ogc:Function name="parameter">
              <ogc:Literal>radiusPixels</ogc:Literal>
              <ogc:Function name="env">
                <ogc:Literal>radius</ogc:Literal>
                <ogc:Literal>50</ogc:Literal>
              </ogc:Function>
            </ogc:Function>
            <ogc:Function name="parameter">
              <ogc:Literal>pixelsPerCell</ogc:Literal>
              <ogc:Literal>10</ogc:Literal>
            </ogc:Function>
            <ogc:Function name="parameter">
              <ogc:Literal>outputBBOX</ogc:Literal>
              <ogc:Function name="env">
                <ogc:Literal>wms_bbox</ogc:Literal>
              </ogc:Function>
            </ogc:Function>
            <ogc:Function name="parameter">
              <ogc:Literal>outputWidth</ogc:Literal>
              <ogc:Function name="env">
                <ogc:Literal>wms_width</ogc:Literal>
              </ogc:Function>
            </ogc:Function>
            <ogc:Function name="parameter">
              <ogc:Literal>outputHeight</ogc:Literal>
              <ogc:Function name="env">
                <ogc:Literal>wms_height</ogc:Literal>
              </ogc:Function>
            </ogc:Function>
          </ogc:Function>
        </Transformation>
        <Rule>
          <RasterSymbolizer>
            <Opacity>0.85</Opacity>
            <ColorMap type="ramp">
              <ColorMapEntry color="#2563EB" quantity="0" label="0" opacity="0"/>
              <ColorMapEntry color="#22D3EE" quantity="0.35" label="0.35"/>
              <ColorMapEntry color="#84CC16" quantity="0.6" label="0.6"/>
              <ColorMapEntry color="#FACC15" quantity="0.8" label="0.8"/>
              <ColorMapEntry color="#DC2626" quantity="1" label="1"/>
            </ColorMap>
          </RasterSymbolizer>
        </Rule>
      </FeatureTypeStyle>
    </UserStyle>
  </NamedLayer>
</StyledLayerDescriptor>
