# Jani

App sin conexión que ayuda a un caficultor a decidir, ante una señal en la hoja: **tratar, esperar o consultar a una persona**.
Hackathon Small AI for Development (Banco Mundial × Hack-Nation), sector Agricultura.

Este README explica **quién hace qué, en qué orden y dónde va cada resultado**. La especificación completa está en `JANI_PLAN.md`.

---

## 1. Lo esencial en un minuto

- **Se entrena un solo modelo de ML:** el clasificador de hojas (módulo SEE).
- PREDICT (riesgo) y DECIDE (economía) **no se entrenan**: son reglas y fórmulas que escribe Claude Code.
- VOICE usa audios pregrabados. Para generarlos se usa un modelo de voz **ya entrenado** por Meta; ustedes no entrenan nada.
- Claude Code escribe la app. Las personas del equipo corren Colab, generan los audios y llenan los datos.

| Módulo | ¿Se entrena algo? | Quién lo hace | Dónde queda |
|---|---|---|---|
| SEE | Sí, 1 modelo | Persona, en Colab | `app/public/models/arabica-v1/` |
| PREDICT | No | Claude Code | `app/src/engine/predict.ts` |
| DECIDE | No | Claude Code | `app/src/engine/decide.ts` |
| VOICE | No (modelo de voz ya hecho) | Persona, con un script | `packs/<paquete>/audio/` |

---

## 2. Qué hay en esta carpeta

| Archivo | Para qué sirve | Quién lo usa |
|---|---|---|
| `README.md` | Este instructivo | Equipo |
| `CLAUDE.md` | Reglas y criterios de aceptación | Claude Code |
| `JANI_PLAN.md` | Especificación completa y los 12 prompts | Claude Code y equipo |
| `training/jani_train.ipynb` | Entrena y exporta el clasificador | Persona, en Colab |
| `training/make_audio.py` | Genera los audios de un paquete | Persona, en Colab o local |
| `packs/*/pack.json` | Paquetes locales: frases, reglas, valores | Claude Code los lee; el equipo los llena |
| `docs/DATOS.md` | Fuentes, licencias y límites de los datos | Equipo (va al jurado) |
| `app/` | La app | La escribe Claude Code |

---

## 3. Paso a paso

### Paso A — La app (Claude Code)

Abrir Claude Code en esta carpeta y pedir, uno por uno, los prompts de la sección 13 de `JANI_PLAN.md`. El primero:

> Lee CLAUDE.md y JANI_PLAN.md y ejecuta el prompt 1 de la sección 13.

La app no necesita esperar al modelo ni a los audios: trabaja con resultados simulados y texto hasta que lleguen.

Comandos del proyecto (todos desde `app/`):

```bash
cd app
npm install            # dependencias; copia los .wasm de onnxruntime-web a public/ort/
npm run e2e:install    # una vez: Chromium para las pruebas e2e (queda dentro del proyecto)
npm run dev            # probar en el computador (empaqueta packs/ antes)
npm test               # pruebas unitarias (resolve, PREDICT P1–P4, DECIDE D1–D4, sesión, calidad, paquetes, voz, SMS, ONNX)
npm run e2e            # pruebas de extremo a extremo con Playwright (incluye modo avión)
npm run verify         # tipos + lint + unitarias + build + e2e: debe pasar completo
npm run check:assets   # dice qué falta del modelo real y de los audios
npm run packs          # solo reempaqueta packs/ en public/packs/*.zip + catalog.json
npm run build          # versión para publicar (en app/dist)
npm run android:sync   # build + copia al proyecto Android (Capacitor)
npm run android:apk    # APK de depuración (requiere Android SDK y Java 21)
```

Documentos de estado: `docs/PROGRESO.md`, `docs/DECISIONES.md`, `docs/QA_REPORT.md` y
`docs/PENDIENTES_HUMANOS.md` (pasos exactos para el modelo, los audios, el APK y la publicación).

### Paso B — Entrenar el modelo (persona, en Colab)

1. Ir a https://colab.research.google.com
2. `Archivo → Subir notebook` y elegir `training/jani_train.ipynb`. **Se sube el archivo; no hay que copiar y pegar nada.**
3. `Entorno de ejecución → Cambiar tipo de entorno → GPU T4 → Guardar`.
4. `Entorno de ejecución → Ejecutar todo`.
5. Esperar. Al final el navegador descarga `jani_model_efficientnet_lite0.zip`.

**Qué trae ese zip:**

| Archivo | Qué es |
|---|---|
| `model_int8.onnx` | El modelo comprimido (el que normalmente se usa) |
| `model_fp32.onnx` | El mismo modelo sin comprimir |
| `model_card.json` | Ficha: clases, normalización, umbrales, métricas y cuál archivo usar |
| `confusion_*.png` | Gráficos de aciertos y errores, para el video |

Son **dos archivos del mismo modelo**, no dos modelos distintos.

**Dónde va:** descomprimir todo dentro de `app/public/models/arabica-v1/`, reemplazando el `model_card.json` de ejemplo. La app detecta el modelo real sola.

**¿Hay que entrenar más de una vez?** Solo si el notebook lo pide. Si al final imprime que conviene el plan B, cambiar en la celda Configuración a `MODEL_NAME = "mobilenetv3_small_100"` y ejecutar todo de nuevo. Se usa uno solo de los dos.

**Si una descarga de datos falla:** el notebook dice qué página abrir, qué archivo bajar y con qué nombre subirlo a Colab (ícono de carpeta, a la izquierda). Luego se vuelve a ejecutar esa celda.

**Qué número mirar:** la precisión en Uganda y Perú ("fuera de distribución"). La de validación sale cerca de 99% y no es representativa.

### Paso C — Generar los audios (persona)

El mismo script sirve para **español y suajili**; cada paquete indica su modelo de voz.

En Colab, en un notebook nuevo (no necesita GPU):

```python
# 1) Subir jani-starter.zip con el ícono de carpeta, y luego:
!unzip -q -o jani-starter.zip
!pip -q install transformers scipy
!python jani/training/make_audio.py jani/packs/colombia-andina
!python jani/training/make_audio.py jani/packs/noor-africa-oriental
!cd jani && zip -qr ../audios.zip packs
from google.colab import files; files.download("audios.zip")
```

**Dónde va:** descomprimir `audios.zip` en la raíz del repositorio. Deja `packs/<paquete>/audio/<frase>.mp3` (38 por paquete) y actualiza cada `pack.json`.

Si prefieren voz humana en español (suena mejor), graben cada frase y guárdenla con el nombre de su clave, por ejemplo `dx_roya.mp3`. Las claves están en `pack.json`, sección `phrases`.

Después de agregar audios o cambiar un `pack.json`, hay que volver a empaquetar: `npm run build` desde `app/` (empaqueta solo), o `npm run packs`. Suban `version` en el `pack.json` para que los teléfonos que ya tienen el paquete vean el botón 🔄 de actualizar.

### Paso D — Llenar los datos reales (persona)

En cada `packs/<paquete>/pack.json`:

| Sección | Qué poner | Mientras esté vacío |
|---|---|---|
| `calendar` | Meses lluviosos y de cosecha, con fuente | Se usan valores de demostración |
| `economics` | Rendimiento, precio, pérdidas y costo de tratamiento, con fuente | Se usan valores de demostración |
| `risk_rules.validated_by` | Nombre del ingeniero agrícola que valida los puntos | Queda como pendiente |
| `backup_contact.phone` | Teléfono del extensionista o cooperativa | El SMS usa el menú de compartir |

Cada valor real necesita su `source`. Con valores de demostración la app funciona igual, pero muestra una etiqueta que lo advierte.

### Paso E — Probar y entregar

1. Publicar la PWA (GitHub Pages, Netlify o Cloudflare Pages).
2. Abrirla en el teléfono, instalarla y cargar los dos paquetes.
3. Poner el teléfono en **modo avión** y hacer el recorrido completo.
4. Grabar el video (2 a 5 minutos). Lista de contenido: sección 15 de `JANI_PLAN.md`.
5. Completar `docs/DATOS.md`.

---

## 4. Preguntas frecuentes

**¿Cuántos modelos de ML tiene Jani?** Uno entrenado por nosotros (clasificador de hojas). Además se usa un modelo de voz de terceros, solo para fabricar los audios antes de empaquetar; no viaja en la app.

**¿El riesgo y la economía son IA?** No. Son reglas y fórmulas auditables. Es una decisión de diseño: así cualquier agrónomo puede revisar por qué la app dijo lo que dijo.

**¿La app necesita internet?** Solo la primera vez, para instalarse. Después, nada del recorrido usa la red.

**¿Qué pasa si el modelo no está listo?** La app sigue en modo simulado. Al copiar el modelo real en su carpeta, cambia sola.

**¿Qué pasa si falta un audio?** La app muestra el texto y, si el teléfono tiene voz para ese idioma, la usa. No se cae.

**¿Puedo agregar otro país?** Copiar una carpeta de `packs/`, traducir `phrases`, ajustar valores, generar audios y empaquetar. No se toca el código.

---

## 5. Pendientes conocidos

- Confirmar las licencias de BRACOL, Uganda, Perú y RoCoLe en sus páginas de Mendeley.
- Validar las frases en suajili con un hablante nativo.
- Validar los puntos de riesgo con el ingeniero agrícola.
- Reemplazar los valores de demostración por datos con fuente.
- El notebook y el script de audios no se han ejecutado todavía: la primera corrida puede pedir ajustes.
