# Pendientes para el equipo (personas)

La app está lista para recibir el modelo y los audios **sin tocar código**. Todos los comandos se ejecutan dentro de `app/`.

## 0. Preparar el computador (una sola vez)

```bash
cd app
npm install            # también copia los .wasm de onnxruntime-web a public/ort/
npm run e2e:install    # descarga Chromium para las pruebas, dentro de la carpeta del proyecto
npm run verify         # tipos + lint + pruebas unitarias + build + pruebas e2e: debe terminar sin error
```

## 1. Cuando llegue el modelo (Colab)

1. Descomprimir `jani_model_efficientnet_lite0.zip` **dentro de** `app/public/models/arabica-v1/`, reemplazando el
   `model_card.json` de ejemplo. Deben quedar `model_card.json` y el `.onnx` que nombra `recommended_file`
   (normalmente `model_int8.onnx`).
2. Comprobar:
   ```bash
   npm run check:assets
   ```
   La sección "Modelo" debe salir toda en `OK`. Si dice `FALTA`, el mensaje indica el archivo o campo exacto.
   Nota: la ficha puede traer `NaN` en alguna métrica; la app lo tolera (lo trata como vacío).
3. Recompilar y verificar:
   ```bash
   npm run build
   npm run verify
   ```
   Al cargar `model_card.json` con `recommended_file` distinto de `null`, la app deja el modo simulado sola.
   El menú oculto de pruebas (tocar 5 veces el ícono de Captura) deja de aparecer: es la señal de que usa el modelo real.
4. Si el notebook recomienda el plan B, repetir con la salida de `mobilenetv3_small_100`. Solo un modelo a la vez.

## 2. Cuando lleguen los audios

1. Copiar los `.mp3` en `packs/<paquete>/audio/<clave>.mp3` (una por cada clave de `phrases`, 38 por paquete).
   Si se usó `training/make_audio.py`, el script ya los deja ahí y actualiza `audio.status` en el `pack.json`.
2. Comprobar y recompilar:
   ```bash
   npm run check:assets   # la sección de cada paquete debe salir 38/38 OK
   npm run build          # vuelve a empaquetar los zips (scripts/build-packs.mjs) y la app
   ```
3. En un teléfono que ya tenía el paquete instalado: abrir **Paquetes** y tocar 🔄 en el paquete (aparece cuando
   la versión del catálogo es distinta). Para que aparezca, **suban `version` en el `pack.json`** al cambiar audios o datos.

## 3. Datos reales (sin código)

En cada `packs/<paquete>/pack.json`: llenar `calendar`, `economics` con su `source` (que no empiece por `TODO`),
`risk_rules.validated_by` y `backup_contact.phone`. Mientras un valor no tenga fuente, la app usa el de demostración
y muestra la etiqueta "Datos de demostración". Luego `npm run build`.

## 4. Prueba a mano en el teléfono (modo avión)

Lo que las pruebas automáticas **no** pueden cubrir (ver `docs/QA_REPORT.md`):

1. Publicar o servir la app por HTTPS (ver sección 6) y abrirla en el teléfono con internet **una vez**.
   Esperar unos segundos a que termine la precarga (≈ 15 MB + el modelo). En Android Chrome: "Agregar a la pantalla principal".
2. Instalar los dos paquetes desde **Paquetes** y elegir el área de la finca.
3. Activar **modo avión**. Cerrar y volver a abrir la app.
4. Hacer el recorrido completo con hojas reales: 5 fotos → diagnóstico → dos preguntas → riesgo → decisión → elegir →
   confirmación → ver el caso en Pendientes.
5. Comprobar: suena el audio de cada pantalla (o se lee el texto si falta), cambiar de paquete en caliente cambia
   idioma y valores, una foto oscura o movida pide repetirla, y con hojas dudosas sale "No estoy segura".
6. Con riesgo ALTO o eligiendo Consultar: el botón de enviar abre la app de SMS solo con texto (sin fotos).
7. Medir: peso del `.onnx` (< 10 MB), tiempo por foto y si el teléfono se calienta.

## 5. APK de Android (Capacitor)

Requiere instalar Android Studio y Java; en esta máquina no estaban instalados.

1. Instalar Android Studio (trae JDK 21) y, desde el SDK Manager, Android SDK Platform 35, Build-Tools y Platform-Tools.
2. Definir `ANDROID_HOME` (p. ej. `C:\Users\<usuario>\AppData\Local\Android\Sdk`) y `JAVA_HOME` (JDK 21);
   agregar `platform-tools` al `PATH`.
3. Desde `app/`:
   ```bash
   npm run android:sync   # build web + copia a android/ (si OneDrive da ENOTEMPTY, repetir)
   npm run android:apk    # la primera vez descarga Gradle 8.11.1 y AGP 8.7.2: necesita internet
   ```
4. El APK queda en `app/android/app/build/outputs/apk/debug/app-debug.apk`.
5. Instalar: con depuración USB, `adb install -r app\android\app\build\outputs\apk\debug\app-debug.apk`;
   o copiar el APK al teléfono y abrirlo (permitir fuentes desconocidas). Alternativa: `npx cap open android` y Run.
6. Abrir la app una vez y repetir la prueba en modo avión de la sección 4.

## 6. Publicar la PWA

La app es estática: se publica el contenido de `app/dist/` tras `npm run build`. Usa rutas relativas (`base: './'`) y
navegación por `#`, así que funciona en cualquier subcarpeta sin reglas de reescritura. Debe servirse por **HTTPS**
(el service worker lo exige).

- **Netlify / Cloudflare Pages:** directorio base `app`, comando `npm run build`, carpeta de publicación `app/dist`.
- **GitHub Pages:** subir el contenido de `app/dist/` a la rama `gh-pages` (o usar una Action que corra `npm ci && npm run build` en `app/`).

Después de publicar, abrir la URL una vez con internet y seguir la sección 4.

## 7. Otros pendientes conocidos

- Confirmar licencias de datasets (`docs/DATOS.md`).
- Validar las frases y audios en suajili con un hablante nativo.
- Revisar y fusionar la rama `build/mvp` (no se hizo push ni merge).
