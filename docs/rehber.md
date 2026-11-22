# Karınca Projesi: Çalışma Rehberi

Bu rehber, projenin **nasıl çalıştığını baştan sona** anlatır. Bilgisayar ya da kod editörü olmadan, sadece GitHub ve tarayıcıdaki Claude ile çalışabilmek için yazıldı.

> **Proje:** Bilkent CS465/575, Ödev 2 (Hierarchical Modeling). WebGL2 ile, hiçbir hazır kütüphane (three.js vb.) kullanmadan, hiyerarşik bir karınca modeli: poz verme, fareyle direkt manipülasyon, keyframe animasyonu, kaydet/yükle ve 4 render modu.

---

## 0. Bu rehber nasıl kullanılır?

- **Sırayla oku.** Her bölüm bir öncekinin üstüne kuruluyor. 1–3. bölümler genel resim, 4–17. bölümler tek tek konular, 18. bölüm kullanıcı akışları, 19. bölüm demo soruları.
- **Kod satırları:** Referanslar `dosya.js:satır` biçiminde ve bu rehberin eklendiği commit'teki koda göre. GitHub'da dosyayı açıp satır numarasına tıklayabilirsin.
- **Yorumlu kod:** Koddaki yorumlar sonradan silindi. Açıklamalı halini görmek için GitHub'da `4669d2e` commit'ine git ("Browse files"):
  `https://github.com/enesovski/hierarchical-modeling/tree/4669d2e`
  Not: O sürümde son sadeleştirmeler yok (ışık slider'ları ve "Direct posing" paneli hâlâ duruyor). Mantık ise aynı.
- **Tarayıcıdaki Claude'a sormak için:**
  1. claude.ai'de bir **Project** aç.
  2. Project bilgisi olarak bu dosyayı ekle; mümkünse "Add content → GitHub" ile repoyu da bağla.
  3. Talimata şunu yaz: *"Bu bir WebGL karınca ödevi. docs/rehber.md projeyi anlatıyor. Bana Türkçe ve sade anlat; demoda sorulabilecek şeylere odaklan."*
  4. Repo bağlanamazsa, sorduğun dosyanın içeriğini GitHub'dan kopyalayıp sohbete yapıştır.

---

## 1. Ödevin istedikleri ve koddaki karşılıkları

| Ödev maddesi | Puan | Nerede |
|---|---|---|
| Modeli dış araçla (Blender) yapıp OBJ olarak içe aktarmak | 25 | `assets/models/ant.obj`, [obj-loader.js](../src/obj-loader.js), [insect.js](../src/insect.js) |
| Render: Color / Texture / Shading / Shaded Texture (en fazla 25) | 25 | [shaders.js](../src/shaders.js), [renderer.js](../src/renderer.js), menü: [render-panel.js](../src/ui/render-panel.js) |
| Parçaların farklı karelerde açısını vermek (keyframe) | 5 | [timeline.js](../src/ui/timeline.js), [animation.js](../src/animation.js) (`setKey`) |
| Keyframe'ler arasını interpolasyonla doldurmak | 10 | [animation.js](../src/animation.js) (`samplePose`) |
| Animasyonu kaydetmek / yüklemek | 5 | [animation.js](../src/animation.js) (`animationToJson`, `parseAnimation`) + timeline'daki Save/Load |
| 2 hazır animasyon | 5 | `assets/animations/walk.json`, `looking-around.json` |
| Fareyle parça seçip poz vermek (direkt manipülasyon) | 15 | [picking.js](../src/picking.js), [drag-pose.js](../src/drag-pose.js) |
| Slider'larla poz vermek | 5 | [pose-panel.js](../src/ui/pose-panel.js) |
| Fareyle kamera: döndür / kaydır / zoom | 10 | [camera.js](../src/camera.js) |
| **Zorunlu kural:** WebGL'i sıfırdan kullan, three.js gibi wrapper yok | – | Bütün `gl.*` çağrıları elle yazıldı; matematik de kendi [math.js](../src/math.js) dosyamızda |
| **Zorunlu kural:** Matris yığınıyla ağaç gezme (`figure.js` gibi) | – | [scene-graph.js](../src/scene-graph.js) (`drawHierarchy`) |

---

## 2. Büyük resim

### 2.1 Tek cümlede

Uygulama, **saniyede yaklaşık 60 kez** ekrana bir karınca çizer. Her çizimde "her eklem şu an kaç derecede?" diye bakar ve karıncayı o pozda çizer. Poz verme, animasyon ve kamera, sonuçta ya bu açıları ya da kamerayı değiştirmekten ibarettir.

### 2.2 En önemli fikir: `pose` (tek gerçek kaynak)

Karıncanın bütün eklem açıları **tek bir nesnede** durur:

```js
pose = {
  "global.x": 0, "global.y": 0, "global.z": 0,          // karıncanın dünyadaki yeri
  "global.yaw": 0, "global.pitch": 0, "global.roll": 0,  // karıncanın genel yönü
  "head.yaw": 0,          // kafa sağa-sola
  "head.pitch": 0,        // kafa aşağı-yukarı
  "femurL1.lift": 0,      // sol ön uyluk kalkıklığı
  ...                     // toplam 44 değer, derece cinsinden (x/y/z ise birim)
}
```

**Kural:** Açıları sadece bu nesne tutar, başka hiçbir yer tutmaz.

```
 pose'a YAZANLAR                           pose'u OKUYAN
 ───────────────                           ─────────────
 Slider'lar (Posture paneli)  ──┐
 Fareyle sürükleme            ──┼──►  pose  ──►  her karede karınca bu açılarla çizilir
 Animasyon (timeline)         ──┘
```

Bu yüzden fareyle bir bacağı oynatınca onun slider'ı da kayar; animasyon oynarken slider'lar kendiliğinden hareket eder. Hepsi aynı nesneye bakar.

Bütün açılar **dinlenme pozuna göre fark**tır: hepsi 0 iken karınca Blender'da modellendiği gibi durur.

### 2.3 Kare döngüsü: her karede ne olur?

[main.js:80-98](../src/main.js) içindeki `frame` fonksiyonu:

| Sıra | Satır | Ne yapar | İşi yapan dosya |
|---|---|---|---|
| 1 | `dt = ...` | Son kareden beri geçen süreyi hesaplar (en fazla 0,1 sn). Animasyon hızı bilgisayar hızına değil gerçek zamana bağlı olsun diye. | main.js |
| 2 | `resizeCanvas()` | Pencere boyutu değiştiyse canvas'ı yeniden boyutlandırır. | main.js |
| 3 | `player.update(dt)` | Animasyon oynuyorsa o anın açılarını `pose`'a yazar. | animation.js |
| 4 | `timeline.sync()` | Timeline'daki kırmızı çizgiyi ve kare sayacını günceller. | timeline.js |
| 5 | `updateTransforms(insect, pose)` | `pose`'daki açılardan her eklemin matrisini hesaplar. | scene-graph.js |
| 6 | `posePanel.sync()` | Slider'ları `pose`'a göre günceller. | pose-panel.js |
| 7 | `camera.viewMatrix()`, `projectionMatrix()` | Kamera matrislerini alır. | camera.js |
| 8 | `renderer.render({...})` | Zemini, sonra karınca ağacını çizer. | renderer.js + scene-graph.js |
| 9 | `outline.draw({...})` | Seçili parça varsa etrafına turuncu çizgi çeker. | outline.js |
| 10 | `requestAnimationFrame(frame)` | Tarayıcıya "bir sonraki ekran yenilemesinde beni tekrar çağır" der. | tarayıcı |

Uygulama "bir şey değişince çiz" diye çalışmaz; **sürekli** çizer. Bu yüzden `pose`'daki her değişiklik bir sonraki karede (en geç 1/60 sn sonra) ekranda görünür.

---

## 3. Dosya haritası

```
index.html              Sayfa iskeleti: canvas + timeline + sağ panel
styles/main.css         Görünüm (renkler, yerleşim)
serve.py                Yerel sunucu (python3 serve.py → http://localhost:8000)
src/
  main.js               Orkestra şefi: her şeyi kurar ve kare döngüsünü çalıştırır
  math.js               4x4 matris ve vektör matematiği (kendi yazdığımız)
  gl-utils.js           Shader derleme, şekli (mesh) GPU'ya yükleme ve çizme
  shaders.js            Ana boyama programı (GLSL): 4 render modu + ışık
  primitives.js         Zemin için birim kutu
  obj-loader.js         OBJ dosyasını okuyup mesh verisine çeviren parser
  textures.js           Resimleri (doku) yükleyip GPU'ya veren kod
  scene-graph.js        Ağaç yapısı + MATRİS YIĞINI ile ağacı gezme (ödevin kalbi)
  insect.js             Karıncanın ağacı, eklemleri (DOFS) ve eklem dönüşümleri
  renderer.js           Sahneyi çizer (zemin + karınca)
  camera.js             Orbit kamera ve fare kontrolleri
  picking.js            Tıklanan parçayı bulma (ID renkleri)
  drag-pose.js          Parçayı sürükleyerek poz verme
  outline.js            Seçili parçanın turuncu çerçevesi
  animation.js          Keyframe verisi, interpolasyon, oynatıcı, kaydet/yükle
  ui/pose-panel.js      Posture slider'ları
  ui/camera-panel.js    "Reset view" butonu
  ui/render-panel.js    Render modu menüsü
  ui/timeline.js        Alttaki keyframe zaman çizelgesi
assets/
  models/ant.obj        Karıncanın 3D şekli (28 parça), ant.mtl doku bilgisi
  models/ant.rig.json   Hangi parça hangisine bağlı ve eklem noktaları
  models/Ant.blend      Blender kaynak dosyası
  models/gltf_embedded_0.png   Karıncanın doku resmi
  textures/ground.png   Zemin dokusu
  animations/*.json     Hazır animasyonlar (walk, looking-around)
tools/
  make_animations.mjs   Hazır animasyonları IK ile üreten script (bir kez çalıştırılır)
  make_textures.py      Zemin dokusunu üreten script
  export_ant.py         Blender'dan OBJ + rig.json dışa aktaran script (Enes)
```

---

## 4. Temel: koordinatlar ve matrisler ([math.js](../src/math.js))

### 4.1 Koordinat sistemi
- **+Y yukarı**, **+Z karıncanın ileri baktığı yön**, **+X karıncanın solu**.
- Zemin y = 0'da; dinlenme pozunda ayaklar y ≈ 0'a değiyor.

### 4.2 Matris nedir?
Bir **matris**, bir noktaya uygulanacak hareketin tarifidir: kaydır, döndür, büyüt. 4×4 matris kullanıyoruz; noktayı (x, y, z, 1) olarak yazınca kaydırma da çarpımla ifade edilebiliyor (buna *homojen koordinat* denir).

- `translation(x,y,z)` (T): kaydırma
- `rotationX/Y/Z(rad)`: bir eksen etrafında döndürme. `rotationAxis(eksen, rad)`: istenen herhangi bir eksen etrafında döndürme (Rodrigues formülü, [math.js:138](../src/math.js)).
- `scaling(x,y,z)` (S): ölçekleme (zemin kutusu 30×0,1×30 yapılırken)
- `identity()`: "hiçbir şey yapma" matrisi

**Saklanış (column-major):** Matris 16 sayılık bir dizi. (satır r, sütun c) elemanı `m[c*4 + r]` indeksinde. WebGL bu sırayı bekliyor. Kaydırma miktarı `m[12], m[13], m[14]`'te durur.

### 4.3 Çarpma ve sıra
`multiply(a, b)` = **a × b**. Bir noktaya uygulandığında **önce b, sonra a** etki eder. Sıra önemlidir: "önce döndür sonra kaydır" ile "önce kaydır sonra döndür" farklı sonuç verir. `multiplyAll(A, B, C)` = A × B × C.

### 4.4 Diğer yardımcılar
- `invert(m)`: ters matris (Gauss-Jordan eleme). `transpose(m)`: satırla sütunu değiştirme.
- `normalMatrix(modelView)` = `transpose(invert(modelView))`: yüzey yönlerini (normalleri) doğru döndürmek için. Neden gerektiği §8.4'te.
- `perspective(fovy, aspect, near, far)`: perspektif projeksiyon matrisi (uzak küçük, yakın büyük).
- `lookAt(eye, target, up)`: kameranın "nereden, nereye baktığı" matrisi (view matrisi).
- `transformPoint(m, p)`: bir noktayı matrisle taşır (kaydırma dahil). `transformDirection(m, d)`: bir yönü döndürür (kaydırma hariç; yönlerin "yeri" olmaz).
- `cross`, `dot`, `normalize`, `subtract`: vektör işlemleri. `degToRad`: dereceyi radyana çevirir.

---

## 5. GPU'ya çizim nasıl yapılır? ([gl-utils.js](../src/gl-utils.js), [shaders.js](../src/shaders.js))

### 5.1 Mesh (şekil verisi)
Her şekil **üçgenlerden** oluşur. Bir mesh'in verisi dört düz dizi:
- `positions`: her köşenin (x, y, z)'si
- `normals`: her köşedeki yüzeyin dışa bakan yönü (ışık hesabı için)
- `uvs`: her köşenin doku resmindeki karşılığı (u, v), 0–1 arası
- `indices`: hangi üç köşe bir üçgen oluşturuyor

`createMesh(gl, data)` ([gl-utils.js:34](../src/gl-utils.js)) bu dizileri GPU belleğine (buffer) yükler ve bir **VAO** (Vertex Array Object) içinde paketler. Köşe sayısı 65535'i geçerse 32-bit indeks kullanır. `drawMesh` ise "bu paketi üçgen olarak çiz" der (`gl.drawElements`).

Projede bu formatı üreten iki şey var: OBJ okuyucu (karınca) ve `createBox` (zemin).

### 5.2 Shader (GPU'da çalışan program)
GLSL dilinde yazılmış iki küçük program:
- **Vertex shader:** Her köşe için bir kez çalışır. Köşeyi matrislerle taşır ve ekrandaki yerini (`gl_Position`) hesaplar.
- **Fragment shader:** Her piksel için bir kez çalışır. O pikselin rengini hesaplar.

`createProgram` ([gl-utils.js:15](../src/gl-utils.js)) ikisini derleyip bağlar; hata olursa mesajı fırlatır.

İki tür girdi var:
- **attribute** (`in`): her köşeye özel veri (konum, normal, uv). Sabit konumlar kullanılıyor: `ATTRIB = { position: 0, normal: 1, texCoord: 2 }`.
- **uniform**: bir çizim boyunca sabit kalan ayarlar (matrisler, renk, render modu, ışık yönü).

Projede üç ayrı program var: ana çizim (shaders.js), picking (picking.js) ve outline (outline.js).

### 5.3 Depth test (derinlik testi)
`gl.enable(gl.DEPTH_TEST)`: her pikselde "şimdiye kadar çizilenlerin en yakını"nı hatırlar. Daha uzaktaki bir şey sonradan çizilse bile öndekinin arkasında kalır. Böylece çizim sırası önemsizleşir.

---

## 6. Model: OBJ'den karınca ağacına

### 6.1 OBJ formatı ve okuyucu ([obj-loader.js](../src/obj-loader.js))
OBJ düz metin bir dosyadır:
- `v x y z`: köşe konumu
- `vt u v`: doku koordinatı
- `vn x y z`: normal
- `o isim`: yeni bir parça (nesne) başlar. Bizde her eklem ayrı bir `o`: `o head`, `o femurL1` gibi.
- `f a/b/c d/e/f g/h/i`: bir yüz (üçgen veya çokgen); her köşe "konum/uv/normal" numaraları.
- `mtllib ant.mtl`: malzeme dosyası; içindeki `map_Kd` satırı doku resmini gösterir.

`parseObj` her satırı okur ve her `o` parçası için ayrı bir mesh verisi çıkarır:
- **Neden köşeler kopyalanıyor?** OBJ'de konum, uv ve normal ayrı numaralanır; WebGL ise her köşe için tek bir numara ister. Bu yüzden her farklı "v/vt/vn" üçlüsü yeni bir köşe olur (`addCorner`, tekrarları `lookup` ile engelleyerek).
- **Çokgenler** "yelpaze" şeklinde üçgenlere bölünür: (0,1,2), (0,2,3)...
- `loadObj` dosyayı indirir, parse eder, `.mtl`'den doku resminin adresini bulur → `{ parts, diffuseMap }`.

### 6.2 Rig dosyası (`ant.rig.json`)
Her parça için `{ name, parent, pivot }`:
- `parent`: hangi parçaya bağlı (göğsün ebeveyni `null`, yani kök)
- `pivot`: eklemin dönme noktası (dünya koordinatında)

Ebeveynler listede çocuklardan önce gelir. Bu dosyayı Blender'dan `tools/export_ant.py` üretiyor.

### 6.3 28 parça
```
thorax (göğüs, KÖK, karıncanın genel yeri/yönü burada)
├── head (kafa)
│   ├── scapeL ── funiculusL     (sol anten: taban + uç)
│   ├── scapeR ── funiculusR
│   ├── mandibleL                (çeneler)
│   └── mandibleR
├── petiole ── gaster            (bel + karın)
└── femur{L,R}{1,2,3} ── tibia ── tarsus   (6 bacak × uyluk, kaval, ayak)
```
L = sol, R = sağ; 1 = ön, 2 = orta, 3 = arka bacak.

### 6.4 DOFS: eklemlerin serbestlik dereceleri ([insect.js:8-47](../src/insect.js))
`DOFS` listesi her açıyı tanımlar: `{ key, group, node, name, min, max, step, axis, sign }`.
- `key`: `pose`'daki adı, örneğin `"tibiaL1.bend"`.
- `group`: arayüzdeki grup (Body, Head, Antennae & mandibles, Abdomen, Leg L1 … Leg R3). Bu 10 grup hem slider panelindeki bölümler hem de timeline'daki satırlar.
- `min`/`max`: açının sınırları (örneğin kafa sağa-sola -40°…+40°).
- `axis`: hangi eksende dönüyor:
  - `"yaw"`: dikey eksen (sağa-sola dönme)
  - `"raise"`: parçanın üzerinden yatay geçen eksen; pozitif açı parçanın ucunu kaldırır
- `sign`: +1 veya -1. Sağ ve sol tarafın aynı açı için aynı yöne gitmesini sağlar; ayna simetrisi.

Toplam **44 açı**: 6 global + 2 kafa + 8 anten/çene + 4 karın + 24 bacak.

### 6.5 `buildInsect`: ağacın kurulması ([insect.js:107](../src/insect.js))
Rig'deki her parça için:
1. **`createShape`** ([satır 70](../src/insect.js)): Parçanın bütün köşelerinden **pivot çıkarılır**. Böylece eklem noktası parçanın (0,0,0)'ı olur. Bu önemli, çünkü döndürme matrisleri her zaman (0,0,0) etrafında döndürür. Parçanın kutu merkezi (`centre`) de saklanır; sürüklemede tutma noktası olarak kullanılır. Malzeme (renk, doku "ant", parlaklık) eklenir.
2. **Kök (göğüs)** için `rootTransform`: `T(pivot + global x,y,z) × Ry(yaw) × Rx(pitch) × Rz(roll)`. Karıncanın bütününü taşıyan ve döndüren matris.
3. **Diğer parçalar** için `jointTransform` ([satır 99](../src/insect.js)):
   `T(pivot − ebeveynPivot) × döndürme(DOF1) × döndürme(DOF2)...`
   - Önce ebeveynin ekleminden bu eklemin yerine **kaydır**,
   - sonra bu eklemin açılarıyla **döndür**.
   - "raise" ekseni: `normalize(yön × yukarı)`. "Yön" parçanın tek çocuğunun eklemine doğru; çocuk yoksa veya birden fazlaysa parçanın kendi merkezine doğru.
4. `addChild` ile ebeveynine bağlanır.
5. Sonunda her düğüme `node.dofs` yazılır: o parçaya ait `pose` anahtarları. Kök `global.*` anahtarlarını alır. Sürükleme ve timeline bunu kullanır.

Her düğümün `computeTransform(pose)` fonksiyonu vardır; her karede `pose`'dan o eklemin matrisini üretir.

---

## 7. Sahne ağacı ve matris yığını ([scene-graph.js](../src/scene-graph.js)) ★ en önemli kısım

### 7.1 Ağaç nasıl tutuluyor: `child` ve `sibling`
Her düğümün sadece iki bağlantısı var: **ilk çocuğu** (`child`) ve **bir sonraki kardeşi** (`sibling`). Buna *left-child / right-sibling* deniyor; ödevin örnek kodu `figure.js` de böyle.

```
Gerçek aile:                    Kodda tutuluşu:
      göğüs                     göğüs
     /  |   \                     │ child
  kafa  solUyluk  sağUyluk        ▼
          |                     kafa ──sibling──► solUyluk ──sibling──► sağUyluk
       solKaval                                     │ child
                                                    ▼
                                                 solKaval
```
- `createNode` (satır 3): düğüm oluşturur.
- `addChild` (satır 15): ilk çocuk yoksa `child` yapar, varsa kardeş zincirinin sonuna ekler.
- `forEachNode` (satır 26): bütün düğümleri gezer.
- `updateTransforms` (satır 33): her düğümün `transform = computeTransform(pose)` değerini yeniler.

### 7.2 Her düğüm neyi biliyor?
`node.transform` sadece **ebeveynine göre** nerede ve hangi açıda olduğunu söyler. Kaval bacak "uyluğun ucundayım, 20° bükülüyüm" der; dünyada nerede olduğunu bilmez.

Bir parçanın ekrandaki yeri = **kökten ona kadar bütün matrislerin çarpımı**. Örneğin kaval için: `View × Göğüs × Uyluk × Kaval`.

### 7.3 `drawHierarchy`: matris yığınıyla gezme (satır 54-71)
```js
traverse(düğüm):
    push(modelView)                 // şimdiki matrisi sakla
    modelView = modelView × düğüm   // bu düğümün dönüşümünü ekle
    düğümün şekillerini çiz
    traverse(child)                 // çocuklar bu matrisi MİRAS alır
    modelView = pop()               // ebeveynin matrisine GERİ DÖN
    traverse(sibling)               // kardeş, ebeveynin matrisinden başlar
```

**Adım adım örnek.** V = kamera, G = göğüs, H = kafa, U = sol uyluk, K = sol kaval, R = sağ uyluk:

| # | Ne oluyor | modelView | Yığın | Çizilen |
|---|---|---|---|---|
| 1 | göğüs: push, ×G | V·G | [V] | göğüs |
| 2 | çocuğu kafa: push, ×H | V·G·H | [V, V·G] | kafa |
| 3 | kafanın çocuğu yok; pop | V·G | [V] | |
| 4 | kafanın kardeşi sol uyluk: push, ×U | V·G·U | [V, V·G] | sol uyluk |
| 5 | çocuğu sol kaval: push, ×K | V·G·U·K | [V, V·G, V·G·U] | sol kaval |
| 6 | kavalın çocuğu yok; pop | V·G·U | [V, V·G] | |
| 7 | uyluğun alt dalı bitti; pop | V·G | [V] | |
| 8 | uyluğun kardeşi sağ uyluk: push, ×R | V·G·R | [V, V·G] | sağ uyluk |
| 9 | pop | V·G | [V] | |
| 10 | göğsün alt dalı bitti; pop | V | [] | |

**Pop olmasaydı:** 8. adımda modelView hâlâ V·G·U·K olurdu ve sağ uyluk **sol kavalın ucuna yapışık** çizilirdi. Pop'un görevi, bir dal bitince kardeşin ebeveynin matrisinden başlamasını sağlamak.

**Satır sırası önemli:** çocuk pop'tan **önce** gezilir (miras alsın diye), kardeş pop'tan **sonra** (ebeveynin matrisinden başlasın diye).

### 7.4 `drawShape` geri çağrısı
`drawHierarchy(root, view, drawShape)` her parça için `drawShape(shape, modelView, node)` çağırır. Çizici, picking ve outline **aynı gezme kodunu** kullanır; her biri kendi `drawShape` fonksiyonunu verir. Ayrıca `handlePosition` (sürükleme) de view yerine birim matris vererek parçaların dünya konumunu bulmak için bunu kullanır.

`shape.matrix` parçanın kendi çizim ayarıdır: çizerken çarpılır ama çocuklara **geçmez**. OBJ parçalarında birim matris; zeminde ölçekleme matrisi.

---

## 8. Çizim ve görünüm ([renderer.js](../src/renderer.js), [shaders.js](../src/shaders.js))

### 8.1 `render(scene)` her karede
1. Ekranı koyu laciverte boya, derinlik bilgisini sıfırla.
2. Ana shader programını seç.
3. Herkese ortak uniform'ları gönder: projeksiyon, render modu, doku yuvası, ışık yönü.
4. Zemini çiz: `view × zemin.matrix`.
5. Karıncayı `drawHierarchy` ile çiz.

`drawShape` her parça için: `uModelView`, `uNormalMatrix`, `uColor`, doku (varsa), `uUvScale` (zemin dokusu 8×8 tekrar eder), `uSpecular`, `uShininess` gönderir, sonra `drawMesh`.

### 8.2 Işık yönü
Işık dünyada sabit bir yönden gelir: `state.light = { azimuth: 35, elevation: 55 }` derece. Bu iki açı bir yön vektörüne çevrilir; shader hesabı kameranın gözünden yaptığı için yön view matrisiyle döndürülür (`transformDirection(view, yön)`). Böylece kamerayı çevirince ışık kamerayla birlikte dönmez, dünyada sabit kalır.

### 8.3 Vertex shader
Her köşe için:
- `viewPos = uModelView × konum`: köşenin kameraya göre yeri.
- `vNormal = mat3(uNormalMatrix) × normal`: yüzey yönü, kameraya göre.
- `gl_Position = uProjection × viewPos`: ekrandaki yer.
- `vTexCoord`: doku koordinatı fragment shader'a aktarılır.

### 8.4 Normal matrisi neden `transpose(invert(modelView))`?
Normal bir *nokta* değil, yüzeye dik bir *yön*dür. Bir nesne her eksende farklı ölçeklenirse (zemin 30×0,1×30 gibi) normalleri aynı matrisle döndürmek onları yanlış yöne eğer. Ters matrisin transpozu, normalleri yüzeye dik kalacak şekilde doğru döndürür. Sadece döndürme ve kaydırma olan matrislerde sonuç aynı çıkar, ama genel çözüm budur.

### 8.5 Fragment shader ve 4 mod
```
textured = (mod 1 veya 3) ve parçanın dokusu var
lit      = mod 2 veya 3
albedo   = textured ? dokudan okunan renk : düz renk (uColor)
```

| Mod | Ne görünür |
|---|---|
| 0 Color | Her parça düz tek renk, ışık yok |
| 1 Texture | Doku resmi, ışık yok |
| 2 Shading | Düz renk + ışık |
| 3 Shaded texture | Doku + ışık (varsayılan) |

### 8.6 Blinn-Phong ışık modeli (mod 2 ve 3)
Her **piksel** için:
- `n` = yüzey normali (normalize), `l` = ışığa doğru yön, `v` = kameraya doğru yön, `h = normalize(l + v)` (yarı vektör)
- **Diffuse** (mat aydınlanma) = `max(n·l, 0)`: ışığa dönük yüzey parlak, arkası karanlık.
- **Specular** (parlama) = `max(n·h, 0) ^ shininess`: küçük parlak noktalar. `shininess` büyüdükçe nokta küçülür ve keskinleşir.
- **Ambient** (ortam ışığı) = 0,28: gölgedeki yerler kapkara olmasın diye.
- Sonuç: `renk = albedo × (ambient + diffuse) + specular_gücü × specular`

### 8.7 "Smooth shading" neden smooth?
Işık üçgen başına bir kez değil **piksel başına** hesaplanır. Köşelerdeki normaller üçgenin içinde yumuşakça karıştırılır (interpolasyon). Bu yüzden yüzeyde köşeli, "fasetli" bir görünüm oluşmaz. *Flat shading*'de ise her üçgen tek renk olurdu.

### 8.8 Dokular ([textures.js](../src/textures.js))
- Önce 1×1 gri bir yer tutucu konur; resim arka planda yüklenir, gelince GPU'ya verilir.
- `UNPACK_FLIP_Y`: resimler üstten aşağı saklanır, UV ise alttan yukarı; bu yüzden ters çevrilir.
- **Mipmap**: resmin küçültülmüş kopyaları. Uzaktaki küçük parçalarda titreşmeyi önler.
- `REPEAT`: zemin dokusunun tekrarlanabilmesi için.
- Karıncanın dokusu `ant.mtl`'deki `map_Kd`'den gelir ve `"ant"` adıyla kaydedilir ([main.js:36](../src/main.js)). Zeminin dokusu `ground.png`.

---

## 9. Kamera ([camera.js](../src/camera.js))

### 9.1 Orbit kamera
Kamera bir hedef noktasının (`target`) etrafında hayali bir **küre** üzerinde durur:
- `distance`: kürenin yarıçapı (zoom)
- `yaw`: yatayda etrafında dönme açısı
- `pitch`: yukarıdan bakma açısı (-89°…89° ile sınırlı, tepeden geçip ters dönmesin diye)

Gözün yeri (`eye`, satır 24):
```
x = target.x + distance · cos(pitch) · sin(yaw)
y = target.y + distance · sin(pitch)
z = target.z + distance · cos(pitch) · cos(yaw)
```
- `viewMatrix()` = `lookAt(eye, target, yukarı)`
- `projectionMatrix(aspect)` = 45° görüş açısıyla perspektif (near 0,1, far 200)

### 9.2 Fare kontrolleri (`attachOrbitControls`)
| Hareket | Sonuç |
|---|---|
| Sol tıkla sürükle | `rotate`: yaw ve pitch değişir (kamera döner) |
| Sağ / orta tıkla sürükle, ya da Shift + sol | `pan`: hedef noktası ekran düzleminde kayar. Kayma miktarı uzaklıkla ölçeklenir; her zoom seviyesinde aynı hissettirir. |
| Tekerlek | `zoom`: uzaklık çarpanla değişir (2–60 arası) |

**`shouldStart` seçeneği:** Kamera bir tıklamayı almadan önce sorar: "başlayayım mı?" `main.js` şunu verir: `() => !dragPosing.isDragging()`. Yani tıklama bir parçanın üstündeyse sürükleme onu almıştır ve kamera dönmez.

---

## 10. Parça seçme: picking ([picking.js](../src/picking.js))

Sorun: tıklanan pikselde hangi parça var? Çözüm, **görünmeyen bir çizim**:
1. Her parçaya bir numara (ID) verilir (`forEachNode` sırasıyla 1, 2, 3...; 0 = "hiçbir şey").
2. Numara bir renge çevrilir: `id → (id & 255, (id>>8) & 255, (id>>16) & 255) / 255`. Kırmızı kanal ilk 8 bit, yeşil sonraki 8 bit...
3. Tıklandığında sahne **ekranda görünmeyen bir framebuffer'a** (renk + derinlik tamponu) tekrar çizilir; her parça düz ID rengiyle, ışık olmadan.
4. Zemin ID 0 ile çizilir. Böylece zeminin arkasında kalan parçalar seçilemez.
5. `gl.readPixels` ile farenin altındaki **tek piksel** okunur, renk tekrar numaraya çevrilir, numaradan parça bulunur.
6. WebGL'de piksel satırları alttan başlar, farede ise üstten; bu yüzden y ters çevrilir: `(1 − v) × yükseklik`.

Derinlik testi sayesinde hep **önde görünen** parça seçilir. Bu çizim sadece tıklama anında yapılır, her karede değil.

---

## 11. Sürükleyerek poz verme ([drag-pose.js](../src/drag-pose.js))

### 11.1 Fikir
Fareyle bir parçayı sürüklediğinde **parça imleci takip etsin** istiyoruz. Ama değiştirebildiğimiz şey parçanın yeri değil, **eklem açıları**. "Açıyı ne kadar değiştirirsem parça imlece gider?" sorusunu sayısal olarak çözüyoruz.

### 11.2 Tıklama (`pointerdown`, satır 118)
1. Sadece sol tuş. Picking ile parça bulunur; boşluksa hiçbir şey yapılmaz (kamera devralır).
2. `state.selectedNode = parça` (turuncu çerçeve ve timeline satırı buradan).
3. Hangi açılar oynatılacak (`dragKeys`):
   - normal parça: kendi açıları (`node.dofs`), örneğin uyluk için swing + lift
   - **gövde (kök):** sürükle → `global.x`, `global.z` (karınca zeminde kayar); **Shift + sürükle** → `global.yaw`, `global.pitch` (döner)
4. Kamera matrisleri sürükleme boyunca sabit tutulur.
5. **Tutma noktası** (`handlePosition`): parçanın merkezi (OBJ parçasının kutu merkezi). Bu noktanın ekrandaki yeri ile fare arasındaki fark (`offset`) saklanır; parça tıklanınca imlece "zıplamasın" diye.

### 11.3 Sürükleme (`pointermove`): `solveStep` (satır 70)
Hedef = fare + offset. En fazla 4 kez:
1. **Hata:** tutma noktasının ekrandaki yeri ile hedef arasındaki fark (piksel). 0,5 px'ten azsa dur.
2. **Jacobian (J):** Her açıyı tek tek **1° artır**, tutma noktasının ekranda kaç piksel, hangi yöne kaydığını ölç, sonra geri al. Her açı için bir sütun (dx, dy) çıkar: "bu açı 1° değişirse parça şu kadar kayar". Buna *sonlu farklar* denir.
3. **Sönümlü en küçük kareler (damped least squares):**
   `Δaçılar = Jᵀ (J Jᵀ + λI)⁻¹ × hata`
   J Jᵀ 2×2 olduğu için tersi elle hesaplanır (`dampedLeastSquares`, satır 50). λ = 0,05 × iz(J Jᵀ); parça neredeyse hareketsizken (J ≈ 0) dev adımlar atılmasını önler.
4. **Sınırdaki açılar:** Sınırına dayanmış ve daha da itilen bir açı hesaptan çıkarılır, kalanlarla yeniden çözülür (`blockedByLimit`). Yoksa diğer açı onu telafi etmeye çalışıp ileri geri sallanır.
5. **Sadece yaklaştıran adımı kabul et:** Adım (en fazla 5°) uygulanır; parça hedefe gerçekten yaklaştıysa kabul edilir, yoksa adımın yarısı, çeyreği... denenir. Hiçbiri yaklaştırmazsa eski açılar geri yüklenir. Bu sayede mesafe sadece azalabilir ve **titreme imkânsız** olur.
6. Açılar `pose`'a yazılır ve min/max sınırlarına kırpılır. Slider'lar kendiliğinden güncellenir.

**Neden bu yöntem?** Ölçüm ekranda yapıldığı için kamera hangi açıdan bakarsa baksın doğru çalışır; 1 veya 2 açılı eklemlerde ayrı kod gerekmez.

### 11.4 Bırakma
Boş bir yere tıklayıp sürüklemeden (3 pikselden az) bırakırsan seçim kalkar.

---

## 12. Seçim çerçevesi ([outline.js](../src/outline.js))

Seçili parçanın etrafına 3 piksel kalınlığında turuncu çizgi:
1. **Maske:** Görünmeyen bir dokuya sadece seçili parça **beyaz** çizilir.
   - Önce zemin sadece derinlik tamponuna çizilir (`colorMask(false)`): zemin maskeye renk vermez ama arkasındaki parçayı örter. Böylece çerçeve **zeminin içinden görünmez**.
   - Diğer karınca parçaları maskeye hiç çizilmez; seçili parça bir antenin arkasında kalsa bile çerçevesi tam görünür.
2. **Çerçeve:** Ekranı kaplayan tek bir üçgen çizilir (köşeleri `gl_VertexID`'den hesaplanır, buffer gerekmez). Her piksel için:
   - pikselin kendisi maskedeyse dokunma (parçanın içi);
   - değilse etrafına 16 yönde ve 3 mesafede bak; 3 piksel içinde maske varsa turuncu boya.
3. Kalınlık ekran yoğunluğuyla (devicePixelRatio) çarpılır; her ekranda aynı kalınlıkta görünür.

---

## 13. Animasyon ([animation.js](../src/animation.js))

### 13.1 Veri yapısı
```js
animation = {
  name: "walk", fps: 30, length: 420,          // uzunluk kare cinsinden
  loop: true, interpolation: "smooth",
  tracks: {
    "Head":   [ { frame: 0,  values: { "head.yaw": 0,  "head.pitch": 0 } },
                { frame: 25, values: { "head.yaw": 32, "head.pitch": -5 } } ],
    "Leg L1": [ ... ],
    ...
  }
}
```
- **Track (iz):** bir DOF grubu (Body, Head, Leg L1...). Timeline'daki bir satır. Toplam 10 track (`TRACKS`).
- **Key (keyframe):** "bu karede bu grubun açıları şunlardı" notu.
- Her track **kendi keyframe'leri arasında** bağımsız interpolasyon yapar. Hiç keyframe'i olmayan track `pose`'a dokunmaz; o parça kullanıcının verdiği pozda kalır.

### 13.2 Keyframe işlemleri
- `setKey(anim, track, frame, pose)`: o grubun `pose`'daki açılarını kopyalayıp kaydeder; o karede zaten key varsa üzerine yazar.
- `removeKey`, `moveKey` (başka bir karedeki key'in üstüne taşınırsa o key silinir).
- `trackOfNode(node)`: tıklanan parçanın hangi satıra ait olduğunu bulur.

### 13.3 Interpolasyon (`samplePose` + `findSegment`)
Bir kare için: önce bu karenin **hangi iki key arasında** olduğu bulunur (a ve b), sonra aradaki oran `u` (0 = a'da, 1 = b'de).

| Tür | Formül | His |
|---|---|---|
| Linear | `a + (b − a)·u` | Sabit hızla gider, key'lerde ani hız değişimi |
| Ease in/out | `u' = u²(3 − 2u)` (smoothstep), sonra linear | Her key'den yavaş çıkar, yavaşlayarak varır; key'lerde durur |
| Smooth (Catmull-Rom) | 4 nokta: önceki, a, b, sonraki | Key'lerden **durmadan, akarak** geçer |

**Catmull-Rom** ([satır 58](../src/animation.js)): a'dan b'ye giden eğri; komşu key'ler (önceki ve sonraki) eğrinin a ve b'deki yönünü (teğetini) belirler. Bu yüzden hareket key'lerde kırılmaz, akıcı devam eder. Eğri bazen sınırın biraz dışına taşabilir; bu yüzden sonuç min/max'a kırpılır.

**Loop:** Döngülü animasyonda track periyodiktir: son key'den sonra ilk key'e doğru interpolasyon yapılır (ilk key `first + length` karesindeymiş gibi). Böylece başa dönüşte sıçrama olmaz. Döngüsüz animasyonda ilk key'den önce ilk key'in, sondan sonra son key'in değeri tutulur.

### 13.4 Oynatıcı (`AnimationPlayer`)
- `update(dt)`: oynuyorsa `frame += dt × fps`; sona gelince loop ise başa sarar, değilse durur. Sonra `seek`.
- `seek(frame)`: o karenin pozunu `pose`'a yazar (kaydırma, key'e tıklama).
- `play`, `pause`, `stop` (durdurup 0. kareye döner).
- `load(anim)`: animasyonu yükler ve **0. kareye gider**. Kaydedip yükleyince animasyonun baştan başlaması bundan.

### 13.5 Kaydet / yükle
- `animationToJson`: `{ version: 2, name, fps, length, loop, interpolation, tracks }` JSON metni. Timeline'daki **Save** bunu `isim.json` olarak indirir.
- `parseAnimation`: dosyayı okur ve **doğrular**: bilinmeyen track'leri ve açıları atar, değerleri sınırlara kırpar, kareleri 0…length aralığına çeker. Bozuk veya elle düzenlenmiş bir dosya modeli bozamaz. **Load**, `<input type="file">` ile dosya seçtirir.
- Kaydedilen şey animasyonun **kendisi** (keyframe'ler); oynatma çizgisinin o anki yeri kaydedilmez.

---

## 14. Arayüz

### 14.1 Timeline ([timeline.js](../src/ui/timeline.js))
Üst çubuk: ▶ ❚❚ ■, kare sayacı, **Key / Key all / Delete key**, **Save / Load / New**, **Walk / Looking around** hazır animasyonları, isim, uzunluk, interpolasyon türü, Loop.

Altında kare cetveli ve her track için bir satır; keyframe'ler **◆** olarak çizilir.

| Yapılan | Sonuç |
|---|---|
| Cetvele veya satırın boş yerine tıkla / sürükle | Oynatma çizgisi oraya gider (scrub); o karenin pozu gösterilir |
| Satırın adına tıkla | O track seçilir (turuncu) |
| 3D'de bir parçaya tıkla | O parçanın track'i seçilir |
| **K** veya "Key" | Seçili track'in şimdiki pozu, çizginin bulunduğu kareye kaydedilir |
| "Key all" | Bütün track'ler kaydedilir |
| ◆'ye tıkla | Seçilir ve o kareye gidilir |
| ◆'yi sürükle | Başka bir kareye taşınır |
| **Delete** veya "Delete key" | Seçili ◆ silinir |
| **Space** | Oynat / durdur |
| Walk / Looking around | Hazır animasyon yüklenir ve oynar |

Kod iki fonksiyona ayrılmış:
- `refresh()`: animasyon **değişince** çalışır; ◆'leri ve cetveli yeniden kurar.
- `sync()`: **her karede** çalışır; sadece kırmızı çizgiyi, sayacı ve 3D'deki seçimi günceller (ucuz).

Klavye kısayolları, bir yazı kutusuna yazarken devreye girmez.

### 14.2 Slider'lar ([pose-panel.js](../src/ui/pose-panel.js))
- `DOFS`'taki her açı için bir slider üretilir ve gruplara ayrılır (açılır kapanır `<details>` bölümleri).
- Slider oynatılınca `pose[key] = değer`.
- `sync()` her karede çalışır: `pose` başka bir yerden değiştiyse (fare, animasyon, Reset) slider'ı ona çeker.
- "Reset pose" bütün açıları 0 yapar.

### 14.3 Diğer paneller
- **Camera:** "Reset view" kamerayı başlangıç ayarına döndürür.
- **Rendering:** 4 modlu menü → `state.renderMode`.

---

## 15. Hazır animasyonlar nasıl yapıldı? ([tools/make_animations.mjs](../tools/make_animations.mjs))

Bu script uygulamanın **dışında**, bir kez çalıştırılır (`node tools/make_animations.mjs`) ve `assets/animations/*.json` dosyalarını üretir. Uygulama bunları sıradan keyframe'ler olarak oynatır.

- **Gerçek modeli kullanır:** OBJ'yi ve rig'i Node'da okur, uygulamanın `buildInsect`'ini çağırır. Açılar bu yüzden tam bu karıncaya uyar.
- **IK (ters kinematik):** "Ayak şu noktada olsun; bacağın 4 açısı (swing, lift, kaval bend, ayak bend) ne olmalı?" sorusunu çözer. Yöntem sürüklemedekine benzer (sönümlü en küçük kareler, 3 boyutta), artı açıları dinlenme pozuna yakın tutan küçük bir çekim.
- **Walk (yürüme, 14 sn, döngülü):**
  - *Tripod yürüyüşü:* üç bacak (sol ön, sağ orta, sol arka) birlikte adım atarken diğer üçü yerde durur; sonra yer değiştirirler. Gerçek karıncalar böyle yürür.
  - Gövde bir yol izler: 6 birim ileri → yerinde 180° dönüş → geri → tekrar dönüş. Başladığı yerde bitirdiği için döngü kesintisiz.
  - Yerdeki ayak dünyada **sabit** tutulur (kaymaz); havadaki ayak bir yay çizerek bir sonraki basma noktasına gider.
  - Her 3 karede bir key; anten ve karında hafif salınım.
- **Looking around (etrafa bakınma, 6 sn):** Kafa sola, aşağı (koklar gibi, çeneler açılır), sağa ve yukarı bakar; antenler sürekli kıpırdar; gövde hafifçe bakış yönüne eğilirken 6 ayak da yerinde kalır (IK).
- Script en kötü ayak kaymasını yazdırır: orta ve arka bacaklarda 0, ön bacaklarda en fazla 0,14 birim (karınca ~6 birim uzun).

---

## 16. Model araçları

- **`Ant.blend`:** Blender kaynağı. 28 parça, adları düğüm adlarıyla aynı, her parçanın origin'i eklem noktası, ebeveynlikler ağaçla aynı.
- **`tools/export_ant.py`** (Enes): Blender içinde çalışır; OBJ + MTL + `ant.rig.json` üretir. Blender'da Z yukarıdır, uygulamada Y; dönüşüm `(x, y, z) → (x, z, −y)`.
- **`tools/make_textures.py`:** Zemin dokusunu (`ground.png`) üretir; sadece Python standart kütüphanesi. Periyodik gürültü kullandığı için doku dikişsiz tekrar eder.
- **`serve.py`:** Önbelleği kapatan yerel sunucu. Dosyalar `file://` ile açılamadığı için gerekli.

---

## 17. Sayfa ve kurulum ([index.html](../index.html), [main.js](../src/main.js))

- `index.html`: `#viewport` içinde canvas + `#timeline`, sağda `#panel`; sonra `main.js` yüklenir.
- `main.js` sırası:
  1. WebGL2'yi al.
  2. OBJ + rig'i yükle → `buildInsect` → `pose` → `AnimationPlayer`.
  3. Dokular, çizici, kamera, outline.
  4. Zemin (`staticShapes`, ağaçta değil çünkü hiç hareket etmiyor).
  5. `state = { renderMode, light, selectedNode }`.
  6. Picker; **önce** sürükleme, **sonra** kamera kontrolleri bağlanır (tıklamayı önce sürükleme alsın diye). Paneller ve timeline kurulur.
  7. Kare döngüsü başlar.
- `window.app`: tarayıcı konsolundan deneme yapmak için. Örneğin `app.pose["head.yaw"] = 30` yazınca kafa hemen döner.

---

## 18. Kullanıcı akışları: adım adım

### 18.1 Sayfa açılınca
HTML yüklenir → `main.js`: WebGL2 → `ant.obj` + `ant.rig.json` indirilir → parçalar GPU'ya yüklenir → ağaç kurulur → paneller oluşur → kare döngüsü başlar → karınca dinlenme pozunda çizilir.

### 18.2 Bir slider'ı oynatınca
Slider `input` olayı → `pose["femurL1.lift"] = 30` → bir sonraki karede `updateTransforms` uyluğun matrisini yeniden hesaplar → `drawHierarchy` uyluğu, kavalı ve ayağı (miras yoluyla) yeni yerde çizer.

### 18.3 Bir bacağa tıklayıp sürükleyince
`pointerdown` → picking: görünmeyen ID çizimi, tek piksel okunur, "femurL1" bulunur → `selectedNode` = femurL1 (turuncu çerçeve, timeline'da "Leg L1" satırı) → kamera tıklamayı almaz (`isDragging`) → her `pointermove`'da `solveStep`: Jacobian ölç, adımı çöz, yaklaştırıyorsa uygula → `pose` değişir → slider'lar ve çizim güncellenir.

### 18.4 Boşlukta sürükleyince
Picking hiçbir şey bulmaz → sürükleme devreye girmez → kamera `rotate` (veya sağ tık / Shift ile `pan`).

### 18.5 Animasyon yapıp oynatınca
1. Kafaya tıkla ("Head" satırı seçilir); oynatma çizgisi 0'da; **K** → Head için 0. karede key.
2. Cetvelde 60. kareye tıkla; kafayı fareyle sola çevir; **K** → 60. karede key.
3. **Space** → her karede `player.update`: frame ilerler → `samplePose`, 0–60 arası kafa açısını interpolasyonla hesaplar → `pose` → çizim.

### 18.6 Kaydet / yükle
**Save** → `animationToJson` → tarayıcı `isim.json` indirir. **Load** → dosya seç → `parseAnimation` (doğrulama) → `player.load` (0. kareye gider) → timeline'da ◆'ler görünür.

---

## 19. Demoda sorulabilecek sorular ve cevaplar

**S: Modelinizi hiyerarşik olarak nasıl kurdunuz?**
C: Karınca 28 parçalı bir ağaç; kök göğüs. Her düğüm ilk çocuğunu ve sonraki kardeşini tutuyor (left-child / right-sibling, `figure.js` gibi). Her düğümün dönüşümü sadece ebeveynine göre tanımlı.

**S: Matris yığınına neden ihtiyaç var?**
C: Ağacı gezerken bir dala inmeden önce mevcut matrisi push ediyoruz, dal bitince pop ediyoruz. Böylece bir bacağı çizdikten sonra kardeş bacak göğsün matrisinden başlıyor; yoksa sol bacağın dönüşümleri sağ bacağa taşınırdı. Kod: `scene-graph.js`, `drawHierarchy`.

**S: Uyluğu döndürünce kaval ve ayak neden onunla birlikte hareket ediyor?**
C: Çocuklar ebeveynin birikmiş matrisini miras alıyor. Kavalın matrisi View × Göğüs × Uyluk × Kaval, içinde uyluğun dönüşü var.

**S: Bir eklemin matrisi nasıl hesaplanıyor?**
C: `T(pivot − ebeveynPivot) × döndürme(açı1) × döndürme(açı2)`. Önce ebeveynin ekleminden bu eklemin yerine kaydırıyoruz, sonra `pose`'daki açılarla döndürüyoruz. Her karede `updateTransforms` bunu bütün düğümler için yeniden yapıyor.

**S: OBJ'deki köşelerden neden pivotu çıkardınız?**
C: Döndürme matrisleri orijin (0,0,0) etrafında döndürür. Pivotu çıkarınca eklem noktası orijin oluyor ve parça kendi ekleminin etrafında dönüyor.

**S: OBJ'yi nasıl yüklüyorsunuz?**
C: Kendi parser'ımız: `v`, `vt`, `vn`, `f` ve `o` satırlarını okuyup her parça için bir mesh üretiyor; çokgenleri üçgenlere bölüyor; `.mtl`'den doku adını alıyor. Hazır kütüphane yok.

**S: Hangi render modları var?**
C: Color, Texture, Shading, Shaded texture. Hepsi tek bir shader'da, `uRenderMode` ile seçiliyor.

**S: Smooth shading nedir?**
C: Işığı piksel başına, köşe normallerinin üçgen boyunca interpolasyonuyla hesaplıyoruz. Bu yüzden yüzey köşeli değil yumuşak görünüyor.

**S: Işık modeliniz?**
C: Blinn-Phong: ambient + diffuse (`n·l`) + specular (`(n·h)^shininess`), kamera uzayında. Işık dünyada sabit.

**S: Normal matrisi nedir, neden ters-transpoz?**
C: Normaller nokta değil yön. Eşit olmayan ölçekleme normalleri yanlış eğer; model-view'ın ters matrisinin transpozu onları yüzeye dik tutar.

**S: Doku nasıl uygulanıyor?**
C: Her köşenin UV koordinatı var; fragment shader dokudan o UV'deki rengi okuyor. Mipmap ve tekrar (REPEAT) açık; resim yüklenirken Y ekseni çevriliyor.

**S: Fareyle parça seçimini nasıl yapıyorsunuz?**
C: Tıklama anında sahneyi görünmeyen bir framebuffer'a her parça kendi ID rengiyle çizilecek şekilde tekrar çiziyoruz ve farenin altındaki pikseli `readPixels` ile okuyoruz. Renk parçanın numarasını veriyor. Derinlik testi sayesinde önde görünen parça seçiliyor.

**S: Sürükleyerek poz vermeyi nasıl yaptınız?**
C: Parçanın merkezinin imleci takip etmesini istiyoruz. Her açıyı 1° oynatıp merkezin ekranda ne kadar kaydığını ölçüyoruz (Jacobian), sonra sönümlü en küçük karelerle hangi açı değişiminin parçayı imlece yaklaştıracağını çözüyoruz. Sadece gerçekten yaklaştıran adımı kabul ediyoruz, sınıra dayanan açıyı hesaptan çıkarıyoruz; titremeyi böyle önledik.

**S: Kameranız nasıl çalışıyor?**
C: Orbit kamera: hedef etrafında bir küre üzerinde; yaw/pitch ile döner, uzaklık ile zoom, hedefi kaydırarak pan. View matrisi `lookAt`, projeksiyon perspektif (45°). Fare: sol sürükle döndür, sağ sürükle kaydır, tekerlek zoom.

**S: Keyframe'leri nasıl tutuyorsunuz?**
C: Her parça grubu için ayrı bir track; her keyframe "kare numarası + o grubun açıları". Timeline'da her grup bir satır ve keyframe'ler ◆.

**S: İnterpolasyonu nasıl yapıyorsunuz?**
C: Karenin hangi iki key arasında olduğunu bulup aradaki oranla hesaplıyoruz. Linear, ease in/out (smoothstep) ve Catmull-Rom seçenekleri var. Catmull-Rom komşu key'leri de kullandığı için key'lerden durmadan akarak geçiyor.

**S: Döngü (loop) nasıl kesintisiz oluyor?**
C: Döngülü animasyonda her track periyodik; son key'den sonra ilk key'e doğru interpolasyon yapılıyor. Hazır animasyonlar da başladıkları pozda bitiyor.

**S: Animasyonu nasıl kaydediyorsunuz?**
C: JSON olarak: isim, fps, uzunluk, loop, interpolasyon ve her track'in keyframe'leri. Yüklerken dosyayı doğruluyoruz: bilinmeyen alanlar atılıyor, değerler sınırlara kırpılıyor.

**S: Hazır animasyonları nasıl hazırladınız?**
C: Bir Node scriptiyle. Gerçek modeli yükleyip IK ile ayakları yerde tutacak bacak açılarını hesapladı ve sonucu sıradan keyframe dosyası olarak kaydetti. Walk tripod yürüyüşü; looking around kafa ve anten hareketi.

**S: Slider'lar ve fare nasıl senkron kalıyor?**
C: Bütün açılar tek bir `pose` nesnesinde. Slider, fare ve animasyon hepsi buna yazıyor; slider'lar her karede `pose`'u okuyup kendini güncelliyor.

**S: three.js veya başka bir kütüphane kullandınız mı?**
C: Hayır. Bütün WebGL2 çağrıları (shader derleme, buffer, framebuffer, çizim) ve matris matematiği bizim kodumuz.

**S: Neden `requestAnimationFrame` ve `dt`?**
C: `requestAnimationFrame` ekran yenilemesiyle senkron çizim sağlıyor. `dt` (geçen süre) ile animasyon hızı bilgisayarın hızına değil gerçek zamana bağlı oluyor.

**S: Derinlik testi ne işe yarıyor?**
C: Her pikselde en yakın yüzeyi tutuyor; öndeki parça arkadakini örtüyor ve çizim sırası önemli olmuyor. Picking de buna dayanıyor.

---

## 20. Bilinen davranışlar ve tasarım tercihleri

- **Load baştan başlatır:** Kayıt dosyası oynatma çizgisinin o anki yerini değil, animasyonun kendisini tutar; `load` 0. kareye gider.
- **Oynatırken poz verilemez:** Animasyon her karede `pose`'a yazdığı için slider veya fare değişiklikleri üzerine yazılır. Önce Pause'a bas.
- **Track'i olmayan parçalar serbest:** Örneğin Walk'ta Head track'i yok; kafayı oynatabilirsin, animasyon ona dokunmaz.
- **Çerçeve diğer parçaların üstünden görünür**, zeminin altından görünmez (bilinçli tercih: seçili parça her zaman belli olsun).
- **Walk'ta ön ayaklar** çok az kayar (en fazla ~0,14 birim, karınca ~6 birim); orta ve arka bacaklar tam sabit.
- **Işık yönü sabit** (`state.light`); arayüzden değiştirilmiyor.

---

## 21. Sözlük

| Terim | Anlamı |
|---|---|
| WebGL2 | Tarayıcıdan ekran kartına (GPU) çizim yaptırma arayüzü |
| GPU | Ekran kartı; üçgen çizimi ve piksel hesaplarını paralel yapar |
| Mesh | Bir şeklin köşe, normal, UV ve üçgen listesi |
| Shader | GPU'da çalışan küçük program (vertex: köşe başına, fragment: piksel başına) |
| Uniform | Shader'a verilen, çizim boyunca sabit ayar |
| Attribute | Shader'a verilen, köşe başına veri |
| VAO / buffer | GPU belleğindeki köşe verisi ve onun paketi |
| Framebuffer | Çizim hedefi; ekran veya görünmeyen bir doku |
| Matris | Kaydırma / döndürme / ölçekleme tarifi (4×4) |
| View matrisi | Dünyayı kameranın gözünden gösteren matris |
| Projection matrisi | Perspektif: 3D'yi 2D ekrana düşüren matris |
| Model-view | Parçanın birikmiş matrisi × view |
| Normal | Yüzeyin dışa baktığı yön |
| UV | Doku resmindeki koordinat (0–1) |
| DOF | Serbestlik derecesi; bir eklemin bir açısı |
| Pivot | Eklemin dönme noktası |
| Scene graph | Parçaların ağaç yapısı |
| Matris yığını | Ağaç gezerken matrisleri push/pop ile saklama yöntemi |
| Picking | Ekrandaki pikselden hangi nesneye tıklandığını bulma |
| Jacobian | Her açının küçük değişiminin sonucu ne kadar değiştirdiğini gösteren tablo |
| DLS | Damped least squares; sönümlü en küçük kareler çözümü |
| IK | Inverse kinematics; uç noktanın yerinden eklem açılarını bulma |
| Keyframe | Belirli bir karede kaydedilmiş poz |
| Interpolasyon | İki keyframe arasındaki kareleri hesaplama |
| Catmull-Rom | Noktalardan akarak geçen eğri türü |
| Blinn-Phong | Ambient + diffuse + specular ışık modeli |
