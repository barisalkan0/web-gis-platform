// Hoca ödevi (GeoServer POI Entegrasyonu): "Her bir POI kategorisi için GeoServer'da ayrı
// bir Style (SLD) oluşturarak haritada farklı ikon veya renkler ile gösterilmesini sağlayın."
//
// Kategoriler admin panelinden dinamik olarak eklenip/silinebildiği için (bkz. PoiCategory),
// SLD'leri elle tek tek yazmak yerine bu script mevcut kategori listesini API'den okuyup her
// biri için bir .sld dosyası üretir. Renk paleti, frontend/src/pages/MapPage.jsx'teki
// POI_CATEGORY_COLOR_PALETTE ile BİREBİR AYNI (kategori id % palet uzunluğu) — haritadaki
// interaktif (WFS) katman ile GeoServer'ın WMS/SLD render'ı görsel olarak tutarlı olsun diye.
//
// Kullanım:
//   node scripts/generate-poi-category-slds.js
//     -> sadece docs/geoserver-poi-styles/*.sld dosyalarını üretir (GeoServer'a dokunmaz)
//   node scripts/generate-poi-category-slds.js --upload
//     -> ayrıca her stili GeoServer REST API'sine PUT eder (GEOSERVER_ADMIN_USER/
//        GEOSERVER_ADMIN_PASSWORD ortam değişkenleri gerekir)
//
// Yeni bir kategori eklendiğinde/silindiğinde bu script'i tekrar çalıştırman yeterli —
// elle SLD yazmana gerek yok.

const fs = require('fs');
const path = require('path');

const API_BASE = process.env.API_BASE || 'http://localhost:5276/api';
const GEOSERVER_BASE = (process.env.GEOSERVER_BASE || 'http://localhost:8080/geoserver').replace(/\/$/, '');
const WORKSPACE = process.env.GEOSERVER_WORKSPACE || 'basarsoft';
const OUTPUT_DIR = path.join(__dirname, '..', 'docs', 'geoserver-poi-styles');

// frontend/src/pages/MapPage.jsx -> POI_CATEGORY_COLOR_PALETTE ile AYNI sırada tutulmalı.
const PALETTE = [
  '#2563eb', '#db2777', '#16a34a', '#f59e0b', '#7c3aed',
  '#0891b2', '#dc2626', '#65a30d', '#c026d3', '#0d9488',
  '#ea580c', '#4338ca',
];
const NEUTRAL_COLOR = '#6b7280';

// OL tarafındaki POI_LABEL_MAX_RESOLUTION (9.6 m/px) ~ GeoServer scale denominator'a çevrimi
// (OGC standart piksel boyutu 0.28mm kabul edilerek: 9.6 / 0.00028 ≈ 34286).
const LABEL_MAX_SCALE_DENOMINATOR = 35000;

function colorForCategoryId(id) {
  const index = Math.abs(id) % PALETTE.length;
  return PALETTE[index];
}

function slugify(name) {
  return name
    .toLowerCase()
    .replace(/ç/g, 'c').replace(/ğ/g, 'g').replace(/ı/g, 'i').replace(/ö/g, 'o')
    .replace(/ş/g, 's').replace(/ü/g, 'u')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function buildFilterXml(categoryId) {
  return categoryId == null
    ? '<ogc:PropertyIsNull><ogc:PropertyName>category_id</ogc:PropertyName></ogc:PropertyIsNull>'
    : `<ogc:PropertyIsEqualTo><ogc:PropertyName>category_id</ogc:PropertyName><ogc:Literal>${categoryId}</ogc:Literal></ogc:PropertyIsEqualTo>`;
}

function buildSld({ styleName, title, categoryId, color }) {
  const filterXml = buildFilterXml(categoryId);
  return `<?xml version="1.0" encoding="UTF-8"?>
<StyledLayerDescriptor version="1.0.0"
  xmlns="http://www.opengis.net/sld" xmlns:ogc="http://www.opengis.net/ogc"
  xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://www.opengis.net/sld http://schemas.opengis.net/sld/1.0.0/StyledLayerDescriptor.xsd">
  <NamedLayer>
    <Name>poi</Name>
    <UserStyle>
      <Name>${styleName}</Name>
      <Title>${title}</Title>
      <FeatureTypeStyle>
        <Rule>
          <Name>icon</Name>
          <ogc:Filter>${filterXml}</ogc:Filter>
          <PointSymbolizer>
            <Graphic>
              <Mark>
                <WellKnownName>circle</WellKnownName>
                <Fill><CssParameter name="fill">${color}</CssParameter></Fill>
                <Stroke>
                  <CssParameter name="stroke">#ffffff</CssParameter>
                  <CssParameter name="stroke-width">2</CssParameter>
                </Stroke>
              </Mark>
              <Size>16</Size>
            </Graphic>
          </PointSymbolizer>
        </Rule>
        <Rule>
          <Name>label</Name>
          <ogc:Filter>${filterXml}</ogc:Filter>
          <MaxScaleDenominator>${LABEL_MAX_SCALE_DENOMINATOR}</MaxScaleDenominator>
          <TextSymbolizer>
            <Label><ogc:PropertyName>name</ogc:PropertyName></Label>
            <Font>
              <CssParameter name="font-family">Arial</CssParameter>
              <CssParameter name="font-size">12</CssParameter>
              <CssParameter name="font-weight">bold</CssParameter>
            </Font>
            <LabelPlacement>
              <PointPlacement>
                <AnchorPoint><AnchorPointX>0.5</AnchorPointX><AnchorPointY>1.6</AnchorPointY></AnchorPoint>
              </PointPlacement>
            </LabelPlacement>
            <Fill><CssParameter name="fill">${color}</CssParameter></Fill>
            <Halo><Radius>2</Radius><Fill><CssParameter name="fill">#ffffff</CssParameter></Fill></Halo>
          </TextSymbolizer>
        </Rule>
      </FeatureTypeStyle>
    </UserStyle>
  </NamedLayer>
</StyledLayerDescriptor>
`;
}

async function uploadStyle(styleName, sldContent, { user, password }) {
  const authHeader = 'Basic ' + Buffer.from(`${user}:${password}`).toString('base64');
  const checkUrl = `${GEOSERVER_BASE}/rest/workspaces/${WORKSPACE}/styles/${styleName}.sld`;
  const exists = await fetch(checkUrl, { headers: { Authorization: authHeader } }).then((r) => r.ok).catch(() => false);

  if (!exists) {
    const createUrl = `${GEOSERVER_BASE}/rest/workspaces/${WORKSPACE}/styles`;
    const createRes = await fetch(createUrl, {
      method: 'POST',
      headers: { Authorization: authHeader, 'Content-Type': 'application/xml' },
      body: `<style><name>${styleName}</name><filename>${styleName}.sld</filename></style>`,
    });
    if (!createRes.ok) {
      throw new Error(`Stil kaydı oluşturulamadı (${styleName}): ${createRes.status} ${await createRes.text()}`);
    }
  }

  const putUrl = `${GEOSERVER_BASE}/rest/workspaces/${WORKSPACE}/styles/${styleName}?raw=true`;
  const putRes = await fetch(putUrl, {
    method: 'PUT',
    headers: { Authorization: authHeader, 'Content-Type': 'application/vnd.ogc.sld+xml' },
    body: sldContent,
  });
  if (!putRes.ok) {
    throw new Error(`Stil içeriği yüklenemedi (${styleName}): ${putRes.status} ${await putRes.text()}`);
  }
}

async function main() {
  const shouldUpload = process.argv.includes('--upload');

  console.log(`POI kategorileri çekiliyor: ${API_BASE}/PoiCategory`);
  const categoriesRes = await fetch(`${API_BASE}/PoiCategory`);
  if (!categoriesRes.ok) {
    console.error(`Kategori listesi alınamadı (${categoriesRes.status}). Backend (dotnet run) çalışıyor mu?`);
    process.exit(1);
  }
  const categories = await categoriesRes.json();

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const targets = [
    { styleName: 'poi-none', title: 'POI - Kategorisiz', categoryId: null, color: NEUTRAL_COLOR },
    ...categories.map((c) => ({
      styleName: `poi-category-${c.id}`,
      title: `POI - ${c.name}`,
      categoryId: c.id,
      color: colorForCategoryId(c.id),
    })),
  ];

  let uploadCreds = null;
  if (shouldUpload) {
    uploadCreds = { user: process.env.GEOSERVER_ADMIN_USER, password: process.env.GEOSERVER_ADMIN_PASSWORD };
    if (!uploadCreds.user || !uploadCreds.password) {
      console.error('--upload için GEOSERVER_ADMIN_USER ve GEOSERVER_ADMIN_PASSWORD ortam değişkenleri gerekir.');
      process.exit(1);
    }
  }

  for (const target of targets) {
    const sld = buildSld(target);
    const filePath = path.join(OUTPUT_DIR, `${target.styleName}.sld`);
    fs.writeFileSync(filePath, sld, 'utf8');
    console.log(`Yazıldı: ${filePath}`);

    if (shouldUpload) {
      try {
        await uploadStyle(target.styleName, sld, uploadCreds);
        console.log(`  -> GeoServer'a yüklendi: ${target.styleName}`);
      } catch (err) {
        console.error(`  -> YÜKLENEMEDİ: ${err.message}`);
      }
    }
  }

  console.log('\nBitti. --upload vermediysen: docs/geoserver-poi-styles/*.sld dosyalarını');
  console.log('GeoServer admin panelinden (Styles > Add new style) elle yükleyip "poi" katmanına');
  console.log('ek stil (additional style) olarak ekle. Ayrıntı için docs/geoserver-poi-entegrasyonu.md.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
