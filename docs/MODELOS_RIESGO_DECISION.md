# Modelos de RIESGO y DECISIÓN — implementación y calibración

Implementa `Manual_Modelos_Riesgo_y_Decision.md`. Fecha: 2026-10-03. Paquete de parámetros: `2026-10-03-v1`.

> **Resumen honesto.**
> - Los dos modelos están implementados como dice el manual y pasan todas sus pruebas de propiedades. La app los
>   reproduce exactamente: los vectores dorados Python = TypeScript coinciden.
> - Con datos reales se calibraron Λ (con el segmentador), el clima semanal y los órdenes de eficacia.
> - La dinámica de la roya **no** se pudo estimar con el dataset público disponible: viola el supuesto A4 y no supera a
>   una línea base simple.
> - Por la **regla de parada del §7** la app queda en **modo informativo**: muestra rangos, alternativas y costos
>   ocultos, pero no una recomendación automática única. Eso es lo que exige el manual mientras los parámetros sean
>   *prior*.

## 1. Dónde está cada cosa

| Pieza | Archivo | Manual |
|---|---|---|
| Implementación de referencia (Python) | `training/riesgo_decision/jani_rd/` | §0.3 |
| Adaptador de entrada (fotos → conteos por nivel) | `adapter.py` / `app/src/engine/rd/adapter.ts` | §1.2 |
| Motor de RIESGO (capas M, D, L, U; conforme; banderas) | `risk.py`, `markov.py` / `risk.ts`, `markov.ts` | §2 |
| Catálogo de acciones + reglas F0–F2 | `catalog.py`, `demo_catalog.py` / `catalog.ts` | §4 |
| Motor de DECISIÓN (2 épocas, CE, CVaR, VOI, OC, dominancia, F3–F5) | `decision.py` / `decision.ts` | §3, §4.2–4.3 |
| Generador sintético y calibración | `synthetic.py`, `calibrate.py`, `real_data.py` | §2.4, §10 |
| Λ con el segmentador | `calibrate_lambda.py` | §1.3 |
| Pipeline local → paquete de parámetros | `run_calibration.py` → `app/public/models/riesgo-v1/params.json` | §8 |
| Pruebas | `tests/test_properties.py` (31), `tests/test_calibration.py` (6), `app/src/tests/rd.golden.test.ts`, `rd.run.test.ts` | §2.7, §3.6, §7 |
| Conexión con la app | `app/src/engine/rd/run.ts` (entradas), `rdWorker.ts` + `client.ts` (Web Worker), `FlowContext.startRd` | §5 |

## 2. Coherencia con los modelos de visión (M1 y M2)

| Entrada del manual (§1.1) | De dónde sale en Jani |
|---|---|
| `clase`, `p_clase` | Clasificador `arabica-v1` (M1): clase y probabilidad calibrada con temperatura. Las fotos "no estoy segura" no entran. |
| `severidad_pct` | Segmentador `leafseg-v1` (M2): píxeles de síntoma ÷ (hoja + síntoma), la misma fórmula de BRACOL. |
| Sin segmentador | La hoja enferma entra como observación **censurada** ("nivel ≥ 1"): no se inventa un nivel. |
| `p_calidad` | Las fotos que llegan ya pasaron el control de calidad (las malas se repiten). |
| Niveles 0–3 | Umbrales por defecto del manual: < 1 %, 1–10 %, 10–30 %, > 30 % (configurables por enfermedad). |
| Λ (4×4) | **Estimada con el segmentador real** contra las máscaras de expertos de BRACOL (val + test, 100 hojas). |

Λ estimada (filas = nivel real, columnas = detectado):

| | 0 | 1 | 2 | 3 |
|---|---|---|---|---|
| 0 | **0,90** | 0,03 | 0,03 | 0,03 |
| 1 | 0,02 | **0,93** | 0,04 | 0,02 |
| 2 | 0,07 | 0,13 | **0,73** | 0,07 |
| 3 | 0,25 | 0,25 | 0,25 | **0,25** (bloqueado) |

El nivel 3 (severo, > 30 %) queda **bloqueado**: BRACOL no trae ninguna hoja así en validación ni prueba. Si se
observa, la app activa `detector_no_corregible` y pide un técnico, como manda el manual.

## 3. Verificación

| Criterio del manual | Resultado | Evidencia |
|---|---|---|
| S0: las pruebas fallan con errores deliberados | ✅ 8 de 8 mutaciones detectadas (clima con signo invertido, CE invertido, adaptador, efecto de la poda, costo del dinero, caja propia) | prueba de mutaciones sobre `tests/test_properties.py` |
| §2.7 propiedades de RIESGO | ✅ monotonía en severidad, semanas y humedad; filas de expm; π0 → observado con Λ = I; CVaR ≥ P90 ≥ P50 | 31 pruebas en verde |
| §3.6 propiedades de DECISIÓN | ✅ θ mayor ⇒ CE no mayor; CE ≤ E; VOI ≥ 0; OC ≥ 0; acción sin efecto = no intervenir − costos; la más cara con el mismo efecto nunca gana; costos ocultos siempre presentes | ídem |
| S2: la calibración recupera parámetros sintéticos | ✅ Λ (error < 0,05), τ y γ_w con visitas repetidas, g monótona (error < 0,07) con panel de 2 temporadas, κ, cobertura conforme 80 % ± 3 % | 6 pruebas en verde |
| S5: vectores dorados | ✅ TypeScript reproduce Python (generador, transiciones, 2 casos completos de riesgo y decisión) | `rd.golden.test.ts` |
| Rendimiento | Decisión con 1.000 partículas: ~1,2 s en PC; en el teléfono corre en un Web Worker | medido con el perfilador de Node |

## 4. Calibración con datos reales

| Qué | Datos | Resultado |
|---|---|---|
| Clima semanal normal | NASA POWER diario 2001–2024 en **59 puntos cafeteros**: 32 municipios de Colombia; 27 zonas de Kenia, Uganda, Tanzania, Ruanda, Burundi y Etiopía (`build_climate.py`) | Anomalías estandarizadas por semana del año en cada paquete. La app usa el punto más cercano al teléfono (ver §7). |
| Λ | Segmentador M2 vs. máscaras de expertos BRACOL | Arriba; nivel 3 bloqueado |
| Dinámica de la roya (τ0, γ_w) | CATIE/Mendeley (Lasso et al. 2020, CC BY 4.0): 442 observaciones, 111 fechas | **No identificable.** La incidencia **baja** en el 45 % de los intervalos de 14 días (renovación foliar): rompe el supuesto A4. Fuera de muestra, el error es 13,5 puntos con Markov, 12,4 con persistencia y 11,5 con regresión lineal. Se mantiene el prior y la regla de parada §7 queda activa. |
| Eficacia de productos | USDA ARS Hawái 2022–23 (CC0) | Pendiente del logit de incidencia por semana: Priaxor −0,24/−0,15 (baja), cobres 0,00/+0,12, biológicos +0,11/+0,15. Coincide con el orden de los priors del catálogo (sistémico > cobre > biológico). Solo indicio: no hay parcela sin tratar. |
| g, κ, Ŷ0, ancho conforme, θ | — | **Prior**: hacen falta cosechas reales por lote (§9.2), que el seguimiento empieza a capturar |

**Hallazgo para el matemático y el econometrista:** con datos de campo, la cadena "solo ascendente" no describe la
incidencia por lote, porque las hojas nuevas sanas la diluyen. Se propone añadir una tasa de renovación foliar al estado 0 y
reestimar con las visitas repetidas que genere el seguimiento de la app.

## 5. Supuestos agregados en esta implementación

- **A5'.** El efecto del clima γ_w se aplica sobre **anomalías** respecto a lo normal del lugar, no sobre valores
  absolutos. Así el sesgo de altitud de la grilla de NASA POWER (~0,5°) no contamina el resultado.
- La misma γ_w actúa sobre las tres transiciones (con incidencia solo se observa la de infección).
- 1.000 partículas (el manual sugiere ~2.000): los cuantiles son estables y el cálculo cabe en un teléfono de gama baja.
- Números aleatorios comunes entre acciones: las diferencias entre alternativas no las produce el ruido de simulación.
- Unidad de decisión: **kilos de café equivalentes** (dinero ÷ precio mediano); θ = r ÷ rendimiento mediano esperado, con
  r = 3 (prudente), 1 (intermedio, por defecto) y 0,3 (arriesgado).

## 6. Cómo recalibrar (local)

```bash
cd training/riesgo_decision
..\..\.venv\Scripts\python -m pytest tests -q                           # propiedades + recuperación sintética
..\..\.venv\Scripts\python calibrate_lambda.py --model ../../app/public/models/leafseg-v1 --data <lara2018>/segmentation/dataset
..\..\.venv\Scripts\python run_calibration.py --rust data/CLRI_14D.csv --usda data/usda_fungicides_clr.csv --lambda_json data/lambda.json
cd ../../app && npx vitest run src/tests/rd.golden.test.ts            # la app sigue igual a Python
```

## 7. Clima según la ubicación (GPS)

- En **Paquetes → 📍 Usar mi ubicación para el clima**, la persona da permiso. El GPS funciona sin internet.
- La app guarda la ubicación **solo en el teléfono** (IndexedDB) y elige el punto cafetero más cercano del paquete,
  si está a menos de `max_km` (150 km).
- Sin permiso, o lejos de todos los puntos, se usa `default_point`: Chinchiná para Colombia y Nyeri para África Oriental.
- En el caso guardado queda solo el **nombre** del punto, nunca las coordenadas, y nada sale del teléfono.
- Pruebas: `app/src/tests/location.test.ts` (distancia, punto más cercano, respaldo, `buildInputs`) y
  `app/e2e/ubicacion.spec.ts` (navegador con ubicación simulada en Pitalito, Huila).
- Agregar puntos: editar `REGIONS` en `training/riesgo_decision/build_climate.py`, correrlo y volver a generar los
  paquetes. No hay que tocar código de la app.
