# Manual técnico: modelos de RIESGO y DECISIÓN

**Plataforma "Agrónomo de Bolsillo" · Especificación para construir dentro de la app**
Consejo Asesor + revisión matemática y econométrica · Octubre 2026

> **Estado y límites de este documento.**
> - Las formulaciones usan métodos clásicos (cadenas de Markov, riesgo entrópico, CVaR, predicción conforme, paneles). Fueron escritas por el consejo sin verificación formal ni búsqueda bibliográfica en esta sesión. **Un matemático y un econometrista deben revisarlas antes de congelar la versión.**
> - **Ningún parámetro viene calibrado para café.** Todo valor inicial marcado como *prior* es un punto de partida a reemplazar con datos propios.
> - Los valores agronómicos (umbrales, eficacias, costos, dosis) **no están en este manual a propósito**: los define el catálogo validado por extensión técnica (sección 6).
> - Las garantías son siempre **condicionales a los supuestos** de la sección 9.

---

## 0. Cómo leer y usar este manual

**Para quien construye (humano o Claude dentro de la plataforma):**

1. Construir primero un **generador de datos sintéticos** (sección 10) y el **arnés de pruebas**. Ningún módulo se da por bueno hasta pasar sus pruebas de propiedades.
2. Orden de módulos: `Adaptador de entrada → RIESGO → Catálogo de acciones y reglas → DECISIÓN → Banderas y presentación`.
3. **Implementación de referencia en Python** (numpy/scipy), validada con pruebas; luego portar a móvil y comprobar con *vectores dorados* (mismas entradas, mismas salidas dentro de tolerancia).
4. **Entrenamiento/calibración en la nube; inferencia en el teléfono.** El teléfono recibe un *paquete de parámetros versionado* (sección 8).
5. Cada salida lleva siempre: rango (no cifra única), nivel de evidencia de sus parámetros y banderas de validez.

**Flujo general**

```
Etapa 1 (visión) ──► ADAPTADOR ──► RIESGO ──► partículas (creencia) ──► DECISIÓN ──► pantalla
 fotos, clase,        niveles,        π0, π_T,       + catálogo de acciones        ranking, costos ocultos,
 severidad, conf.     conteos,        pérdida ℓ,     + reglas + costos + precio    costo de oportunidad,
                      pesos           CVaR, banda                                  valor de esperar / re-medir
```

---

## 1. Contrato de datos y adaptador de entrada (Etapa 1 → RIESGO)

Es la pieza que más afecta la calidad: errores aquí contaminan todo lo demás.

### 1.1 Qué debe entregar la Etapa 1, por foto

```json
{
  "foto_id": "...", "lote_id": "...", "fecha": "...", "gps": [lat, lon],
  "tipo": "hoja | fruto | rama",
  "clase": "roya | minador | phoma | cercospora | broca | sana | ...",
  "p_clase": 0.0-1.0,            // confianza calibrada de la clase
  "severidad_pct": 0.0-1.0,      // lesión/hoja (hoja) o frutos dañados/total (fruto)
  "p_calidad": 0.0-1.0,          // calidad de captura (nitidez, luz, encuadre)
  "n_cerezas": entero | null,    // solo fotos de rama/fruto
  "version_modelo": "..."
}
```

### 1.2 Reglas del adaptador (en orden)

| Paso | Regla | Razón |
|---|---|---|
| 1. Filtrar | Descartar fotos con `p_calidad` o `p_clase` bajo umbral configurable; eliminar duplicados (misma planta, mismos segundos) | Fotos malas o repetidas inflan la certeza |
| 2. Separar por enfermedad | **Una cadena por enfermedad** (roya, broca, …); nunca mezclar clases en un mismo vector de estados | Dinámica y daño son distintos por enfermedad |
| 3. Unidad de muestreo | La unidad es la **hoja** (para enfermedades foliares) o el **fruto** (para broca). El "nivel" describe esa unidad, y la función de daño `g` se calibra para traducir la distribución de niveles de unidades a pérdida de rendimiento | Evita suponer que la severidad de una hoja equivale a la de toda la planta |
| 4. Discretizar | `s = 0,1,2,3` según umbrales sobre `severidad_pct`. **Umbrales por defecto a validar con extensión**: p. ej. sana < 1 %, leve 1–10 %, moderada 10–30 %, severa > 30 % (hoja). Para broca se definen sobre % de frutos dañados. Los umbrales son configurables por enfermedad | Fija el espacio de estados de la cadena |
| 5. Conteos | `n̂_s` = número de unidades en cada nivel; `m` = total de unidades válidas | Entrada de la capa de medición |
| 6. Tamaño efectivo | `m_eff = m / (1 + (b − 1)·ρ)` con `b` = unidades por planta (o por punto de muestreo) y `ρ` = correlación intra-grupo | Unidades de la misma planta no son independientes |
| 7. Estimar `ρ` | Con datos propios: estimador ANOVA de correlación intra-clase (unidades dentro de planta/punto). Hasta tener datos, usar un valor conservador (`ρ` alto, p. ej. 0,3) y marcarlo como *prior* | Subestimar `ρ` da intervalos demasiado estrechos |
| 8. Cobertura mínima | Si `m_eff` < mínimo (configurable, p. ej. 10), la salida se marca "muestra insuficiente" | Evita conclusiones con 2 fotos |
| 9. Fruto y conteo | `n_cerezas` por rama se escala a lote con el protocolo de muestreo y entra como **covariable** del modelo de rendimiento potencial, no como número determinista | El conteo es ruidoso |
| 10. Clima | Agregar a frecuencia semanal: temperatura máxima media, días con humedad relativa > 80 %, lluvia acumulada; estandarizar con media y desviación del entrenamiento | Covariables de la dinámica |

### 1.3 Calibrar el detector antes de usarlo (obligatorio)

1. **Calibración de confianza:** *temperature scaling* sobre un conjunto de validación (no el de entrenamiento). Verificar con diagrama de confiabilidad y ECE.
2. **Matriz de confusión de niveles `Λ`** (4×4), con `Λ[s, ŝ] = P(detector dice ŝ | nivel real s)`:
   - Se estima con un subconjunto **etiquetado por expertos en campo**, con luz y dispositivos reales.
   - Suavizado: `Λ̂[s, ŝ] = (n_{sŝ} + a) / (n_s + 4a)` con `a` pequeño (p. ej. 1).
   - **Condición dura:** `Λ̂[s, s] > 0,5` para todo `s`. Si no se cumple, la corrección de medición no es confiable y el nivel afectado se bloquea hasta mejorar el detector.
   - Esperado: los errores se concentran en niveles adyacentes. Si hay saltos grandes, revisar los umbrales.
3. **`Λ` se recalibra por dispositivo y por temporada** si hay deriva.

---

## 2. Modelo de RIESGO

### 2.1 Qué responde

> *Dado lo que muestran las fotos hoy, el clima y el tiempo que falta para cosechar, ¿cuánto rendimiento voy a perder y con qué incertidumbre?*

### 2.2 Estructura (cuatro capas más una envoltura)

**Estados:** `s ∈ {0,1,2,3}` (sana, leve, moderada, severa); el 3 es absorbente.

**Capa M, medición.** Los conteos observados dependen del estado verdadero y del error del detector:

```
n̂ ~ Multinomial( m_eff ,  Λᵀ π0 )        π0 = distribución verdadera de niveles hoy
Prior:  π0 ~ Dirichlet(α0)                 α0 = fuerza × distribución regional (fuerza pequeña, p. ej. 4)
```
Como `m_eff` no es entero, se usa **verosimilitud atemperada**:
```
log L(π0) = (m_eff / m) · Σ_s n̂_s · log( (Λᵀ π0)_s )
```

**Capa D, dinámica.** Cadena de Markov continua que solo avanza:
```
q_{s,s+1}(w) = λ_s(w) = exp( γ_s + γ_wᵀ w ),   s = 0,1,2
Q = matriz con λ_s en la superdiagonal y −λ_s en la diagonal
Con clima semanal i (constante por tramos):
   π_T = π0 · ∏_i expm( Q(w_i) · Δ_i )       (producto en orden temporal)
```
Se recomienda parametrizar `γ_s = −log(τ_s)` con `τ_s` = semanas medias en el estado `s` en condiciones medias; así los priors se elicitan de forma intuitiva con técnicos.

**Capa L, daño.**
```
g: {0,1,2,3} → [0,1],  g(0) = 0,  g no decreciente
μ = Σ_s π_{T,s} · g(s)                       (acotar μ ∈ [ε, 1−ε])
ℓ | μ ~ Beta( μ·κ , (1−μ)·κ )               κ = precisión
```

**Capa U, incertidumbre y cola.** Todo lo anterior se evalúa sobre `N` partículas (muestras de `π0` y de los parámetros `γ, g, κ`):
```
CVaR_α(ℓ) = media de ℓ en el peor α de las simulaciones   (α = 10 %)
Salidas: P10, P50, P90 de ℓ;  P(ℓ > ℓ*)
```

**Envoltura conforme (cobertura sobre lo observable).** La pérdida `ℓ` nunca se observa directamente; sí el rendimiento `Y`:
```
Y = Ŷ0 · (1 − ℓ)           Ŷ0 = rendimiento potencial sin plaga (sección 2.4)
```
Intervalo de `Y` con *conformalized quantile regression*: puntaje `S_i = max( q10_i − Y_i , Y_i − q90_i )` en lotes de calibración, y el intervalo final es `[ q10 − Q̂ , q90 + Q̂ ]`, con `Q̂` = cuantil `⌈(n+1)(1−α)⌉/n` de los `S_i`.

### 2.3 Algoritmo de inferencia (pasos)

1. Generar `N` partículas (p. ej. 2.000) de `π0` desde el prior Dirichlet; para cada una, un conjunto de parámetros `(γ, g, κ)` tomado del paquete de parámetros posterior.
2. Pesar cada partícula con la verosimilitud atemperada de la capa M. Normalizar pesos.
3. **Revisar el tamaño efectivo de muestra** `ESS = 1 / Σ w_i²`. Si `ESS < 0,2·N`, remuestrear (o aumentar `N`) y marcar bandera.
4. Propagar cada partícula con `expm` por tramos de clima (matriz 4×4 triangular: coste trivial en el teléfono).
5. Calcular `μ` y muestrear `ℓ` por partícula.
6. Resumir con cuantiles ponderados y CVaR; convertir a `Y`; aplicar el ensanche conforme.
7. Evaluar banderas (2.6).

### 2.4 Parámetros y cómo calibrarlos

| Parámetro | Prior inicial | Cómo se estima con datos | Datos mínimos | Frecuencia |
|---|---|---|---|---|
| **`Λ`** | Estimado del conjunto validado | Conteos de la matriz de confusión con suavizado (1.3) | Cientos de unidades etiquetadas por experto | Por temporada/dispositivo |
| **`τ_s`** (semanas por estado) | Elicitación con técnicos: LogNormal amplia | Verosimilitud de cadena observada en fechas discretas `L = ∏ P_{z_k z_{k+1}}(Δ_k)`; con error de medición es un modelo oculto de Markov (algoritmo *forward* con `Λ`). Estimar por MAP o MCMC | **Visitas repetidas al mismo lote** (≥ 2 fechas), con intervalos variados | Cada temporada |
| **`γ_w`** (efecto del clima) | `N(0, 1)` con encogimiento fuerte | Se estima junto con `τ_s` en la misma verosimilitud | Varios lotes y semanas con clima distinto | Cada temporada |
| **`g(1), g(2), g(3)`** | Tabla de extensión (valores a completar con técnicos) | **Mínimos cuadrados no lineales con monotonía** sobre el panel (abajo). Parametrizar con incrementos positivos: `g(1)=σ(a1)`, `g(2)=g(1)+(1−g(1))σ(a2)`, `g(3)=g(2)+(1−g(2))σ(a3)` | ≥ 2 temporadas para efectos fijos de lote | Cada temporada |
| **`κ`** | Moderado | Método de momentos: `Var(ℓ) = μ(1−μ)/(κ+1)` con los residuos | Residuos del panel | Cada temporada |
| **`Ŷ0`** | Promedio regional por variedad/altitud | Efectos fijos de lote del panel (abajo) | ≥ 2 temporadas por lote | Cada temporada |
| **Ancho conforme `Q̂`** | Ancho conservador por defecto | Cuantil de puntajes `S_i` en lotes con cosecha conocida | **≥ 30 a 50 lotes** de la temporada reciente | Cada temporada |

**Truco de identificación clave:** calibrar **por separado** la dinámica y el daño.
- `g` se estima con la **última visita antes de cosecha** (donde `Δ ≈ 0`, así que `π_T ≈ π observado`). Aquí la dinámica casi no influye.
- `τ_s, γ_w` se estiman con **visitas repetidas**, sin necesitar la cosecha.
Así se evita que errores de dinámica contaminen `g` y viceversa.

**Modelo de panel para `g` y `Ŷ0`** (lote `j`, año `t`, cooperativa `c`):
```
log Y_jt = α_j + δ_{c(j),t} + φᵀ x_jt + log( 1 − μ_jt(g) ) + u_jt
```
- `α_j`: efecto fijo del lote (suelo, altitud, variedad, manejo estable). Da `Ŷ0 = exp(α_j + φᵀx + δ)`.
- `δ_{c,t}`: choques comunes por cooperativa-año (incluye bienalidad y clima general).
- `x_jt`: controles. **Para la carga de cosecha usar una medida observada temprano** (floración o conteo temprano de cerezas), no el rendimiento rezagado: usar el rezago produce sesgo en paneles cortos.
- **Errores estándar:** agrupados por lote; con pocos clusters, bootstrap *wild cluster*.
- **Una sola temporada de datos:** `α_j` no se puede estimar. Usar un efecto aleatorio jerárquico por cooperativa y declarar la limitación en la app.

**Advertencia econométrica:** si la roya es más severa en años de alta carga (causalidad inversa), `g` queda sesgada. Mitigación: controlar la carga temprana, pruebas placebo y de tendencias previas.

### 2.5 Entradas y salidas del módulo (contrato)

**Entradas:** `n̂_s, m, b, ρ` (del adaptador) · `Λ` · `w_i, Δ_i` (clima semanal y pronóstico/escenarios) · semanas a cosecha · `Ŷ0` con su incertidumbre · paquete de parámetros posterior (`γ, g, κ`) · ancho conforme · umbral crítico `ℓ*`.

**Salidas:**
```json
{
  "particulas": [{"pi0": [...], "pi_T": [...], "w": 0.0, "mu": 0.0, "ell": 0.0}],
  "ell": {"p10": 0, "p50": 0, "p90": 0, "cvar10": 0, "p_sobre_umbral": 0},
  "Y":   {"p10": 0, "p50": 0, "p90": 0, "conforme": [low, high]},
  "banderas": ["..."],
  "evidencia": {"gamma": "prior|estimado", "g": "prior|estimado", "conforme": "default|calibrado"}
}
```

### 2.6 Banderas de validez (se muestran al usuario)

| Bandera | Condición | Efecto |
|---|---|---|
| `muestra_insuficiente` | `m_eff` < mínimo | No se muestra recomendación fuerte |
| `ess_bajo` | `ESS < 0,2·N` | Se remuestrea; si persiste, baja la confianza |
| `detector_no_corregible` | Algún `Λ[s,s] ≤ 0,5` para un nivel con conteos relevantes | Se bloquea ese nivel y se pide técnico |
| `clima_fuera_de_rango` | `w` fuera del rango de entrenamiento | Ensanchar bandas |
| `calibracion_vieja` | Parámetros de la temporada anterior sin recalibrar | Marcar |
| `parametros_prior` | `γ`, `g` o `κ_a` aún son juicio experto | Mostrar "estimación basada en criterio técnico, no en datos propios" |

### 2.7 Pruebas obligatorias (propiedades que deben cumplirse)

- Más severidad inicial (en orden estocástico) → pérdida predicha **nunca menor**.
- Más semanas a cosecha → pérdida **nunca menor**.
- Más humedad (con `γ_w` humedad > 0) → pérdida **nunca menor**.
- Cada fila de `expm(QΔ)` suma 1 y es triangular superior.
- Con `Λ = I` y muchas fotos, el estimador de `π0` se acerca a la proporción observada.
- Con datos sintéticos, la cobertura del intervalo conforme se acerca a la nominal.
- Con `α` pequeño, CVaR ≥ P90 ≥ P50.

---

## 3. Modelo de DECISIÓN

### 3.1 Qué responde

> *Dadas las alternativas posibles para este lote hoy, ¿cuál conviene, cuánto cuesta realmente cada una (incluyendo lo oculto), y vale la pena esperar o volver a medir?*

### 3.2 Estructura (decisión bayesiana secuencial con utilidad exponencial)

**Creencia inicial:** las partículas que entrega RIESGO.

**Épocas:** `t0` (hoy) y `t1 = t0 + Δ` (nueva medición opcional). La v1 usa **dos épocas**; una tercera época se añade solo cuando exista evidencia para modelarla.

**Efecto de una acción `a` sobre el modelo de RIESGO:**
```
1) Efecto inmediato:   π' = π · T_a,   con T_a[s, s−1] = d_a (s ≥ 1),  T_a[s, s] = 1 − d_a
   (la poda/cosecha sanitaria retira unidades afectadas; d_a ~ Beta con incertidumbre)
2) Efecto sostenido:   λ_s → (1 − κ_a) · λ_s  durante la duración del efecto
   (κ_a ~ Beta con incertidumbre; 0 = sin efecto, 1 = detiene el avance)
```
Entre acciones la cadena sigue siendo progresiva; las acciones son las únicas que mueven el estado hacia abajo.

**Margen terminal (por partícula):**
```
M = Y0 · (1 − ℓ_a) · P · q_a  −  Σ_épocas [ C_a + F_a + L_a + Cert_a + Cal_a + Dem_a ]
```

| Término | Qué es | Cómo se calcula |
|---|---|---|
| `Y0·(1−ℓ_a)·P·q_a` | Ingreso esperado bajo la acción | `ℓ_a` simulada con las dinámicas modificadas; `P` muestreado de la tabla de cuantiles de precio; `q_a` = factor de calidad |
| `C_a` | Costo directo | Insumo + aplicación + equipo (catálogo, valores locales) |
| `F_a` | Costo del dinero | `r × monto financiado × tiempo hasta cosecha`. Si no hay que endeudarse, se usa el costo de oportunidad del capital propio |
| `L_a` | Costo de oportunidad laboral | `jornal(t) × jornales_a`, con `jornal(t)` mayor en temporada de cosecha |
| `Cert_a` | Riesgo de certificación/residuos | Pérdida esperada de prima si el insumo no es compatible |
| `Cal_a` | Efecto sobre la calidad | Cambio esperado en puntaje o factor de rendimiento |
| `Dem_a` | Costo de demora | Se obtiene al comparar actuar hoy vs. mañana (3.4) |

**Utilidad exponencial (equivalente cierto):**
```
CE_θ(X) = −(1/θ) · log E[ exp(−θ X) ]       θ > 0 = aversión al riesgo del productor
```
Propiedades útiles: `CE(c + X) = c + CE(X)` (los costos ciertos salen de la expectativa) y `CE(CE(X | info)) = CE(X)` (consistencia temporal: el plan óptimo hoy sigue siéndolo mañana).

**Recursión hacia atrás:**
```
V_{t1}(b) = max_{a1 ∈ A_{t1}(b)} { − costos(a1) + CE_θ[ Margen_terminal | b, a1 ] }
V_{t0}    = max_{a0 ∈ A_{t0}}    { − costos(a0) + CE_{o}[ V_{t1}( b'(b, a0, o) ) ] }
```
donde `o` es el resultado de la nueva medición y `b'` la creencia actualizada con ella.

### 3.3 Implementación con partículas (sin complicarlo)

1. Para cada `a0`, propagar las partículas hasta `t1` (con `T_{a0}` y `κ_{a0}`).
2. **Simular la observación futura** por partícula: dado `π_{t1}` de esa partícula, simular los conteos de una muestra de tamaño `m1` con la matriz `Λ`, y **agruparlos en 3 categorías** (bajo, medio, alto) según la proporción de unidades en niveles ≥ 2.
3. Cada categoría es un nodo `o`; sus partículas, con sus pesos, forman la creencia `b'`.
4. En cada nodo, para cada `a1`: propagar hasta cosecha, calcular `M`, y `CE` del nodo con `log-sum-exp` (estabilidad numérica; trabajar con `M` en unidades de miles o millones de pesos para que `θ·M` no desborde).
5. `V_{t1}(o) = máx_{a1}`; luego `V_{t0}(a0) = −costos(a0) + CE sobre o` ponderado por la probabilidad de cada nodo.
6. Calcular las salidas (3.5).

Coste: pocas acciones (≤ 6) × 3 observaciones × pocas acciones en `t1` × `N` partículas. Es liviano, pero se recomienda precomputar en la nube la **tabla de política** para los casos frecuentes y dejar el cálculo exacto en el teléfono solo para el caso del lote.

### 3.4 Parámetros y cómo calibrarlos

| Parámetro | Cómo se obtiene | Notas |
|---|---|---|
| **`θ`** (aversión al riesgo) | **Elicitación con una apuesta 50/50:** "¿cuánto dinero seguro `x_c` aceptas para no jugar a ganar o perder `h`?". Resolver `x_c = −(1/θ)·ln cosh(θh)`; para `θh` pequeño, `θ ≈ −2x_c/h²`. Repetir con 2 o 3 montos. Si `θ` cambia mucho entre montos, la utilidad exponencial describe mal al productor: marcar y usar valor por defecto conservador | Mostrar al usuario como "prudente / intermedio / arriesgado" |
| **`κ_a`, `d_a`** | **Inicio:** priors Beta anchos de extensión técnica (nivel de evidencia = "criterio experto"). **Actualización:** con cada seguimiento "hice X y pasó Y" por Beta-Binomial, solo como indicio. **Efecto causal real:** exige un piloto con grupo de comparación aleatorizado por vereda o cooperativa; sin eso, solo cotas | Los productores que actúan no son comparables a los que no: la tasa de éxito observada **no** es el efecto causal |
| **`C_a`, jornales, `Cert_a`, `Cal_a`** | Catálogo por región, actualizado por técnicos y la cooperativa | Fecha de última actualización visible |
| **`jornal(t)`, `r`, caja `K`, crédito** | Perfil del productor (editable) | El usuario puede cambiarlos y ver el efecto |
| **Precio `P`** | Tabla semanal de cuantiles desde la nube (modelos de series de tiempo contrastados con una línea base simple) | Siempre con marca de antigüedad; **ensanchar los cuantiles según la edad del dato** con un factor configurable, calibrado por backtest |
| **Costo de re-medir `c_obs`** | Costo en tiempo/jornal de una nueva visita de muestreo | Configurable |

### 3.5 Entradas y salidas del módulo (contrato)

**Entradas:** partículas de RIESGO · perfil de lote y productor · catálogo de acciones (sección 4) · tabla de precios · `θ`, `r`, `K`, crédito, `jornal(t)` · `Δ`, `m1`, `c_obs`.

**Salidas:**
```json
{
  "alternativas": [{
     "id": "...", "nombre": "...", "evidencia": "criterio_experto|estimado|piloto",
     "margen": {"ce": 0, "esperado": 0, "cvar10": 0, "p_negativo": 0},
     "perdida_pct": {"p50": 0, "p90": 0},
     "costos": {"directo": 0, "dinero": 0, "laboral": 0, "certificacion": 0, "calidad": 0},
     "costo_oportunidad": 0,
     "viable_hoy": true, "razon_no_viable": null,
     "domina_a": ["..."], "dominada_por": null
  }],
  "valor_de_esperar": 0,
  "valor_de_remedir": 0, "recomendar_remedir": true,
  "sensibilidad": {"theta_bajo": "...", "theta_alto": "..."},
  "banderas": ["..."]
}
```

**Definiciones de las salidas clave:**
- **Costo de oportunidad:** `OC(a0) = V* − V(a0) ≥ 0` (cuánto valor se pierde por elegir `a0` en vez de lo mejor).
- **Valor de esperar:** `V(nada)` ya incluye la opción de actuar en `t1`; el **costo de demora** de una acción es `V(a hoy) − V(a en t1)`.
- **Valor de re-medir:** `V` con observación − `V` sin observación (siempre ≥ 0 antes del costo). Se recomienda re-medir si supera `c_obs`.
- **Dominancia estocástica de segundo orden:** `a` domina a `b` si `∫_{−∞}^{x} [F_b(m) − F_a(m)] dm ≥ 0` para todo `x` (verificación numérica sobre las muestras de margen). Sirve para ordenar sin suponer una función de utilidad cuando el orden es claro.

### 3.6 Pruebas obligatorias

- `θ` mayor → `CE` **nunca mayor**; con `θ → 0`, `CE → E[M]`.
- `CE ≤ E[M]` siempre.
- `valor_de_remedir ≥ 0`; `OC ≥ 0`.
- Con `κ_a = 0` y `d_a = 0` la acción es equivalente a no intervenir menos sus costos.
- Una acción más cara con el mismo efecto nunca supera a la más barata.
- Los costos ocultos nunca se omiten de la salida.

---

## 4. Reglas para generar las alternativas

**Principio:** *las reglas solo deciden qué alternativas son elegibles. El valor (margen, riesgo, costo oculto) lo calcula siempre el modelo de decisión.* Ninguna recomendación sale únicamente de reglas.

### 4.1 Qué hay que construir

Un **catálogo de acciones** (datos, no código) y un **motor de reglas** que lo filtra.

**Ficha de cada acción en el catálogo (ejemplo; valores `null` los completa extensión técnica):**

```yaml
- id: poda_selectiva
  nombre: "Poda selectiva de material afectado"
  aplica_a: [roya]                     # clases
  nivel_min: 1                         # niveles de severidad donde aplica
  ventana_fenologica: null             # etapas permitidas (completar con técnicos)
  semanas_min_a_cosecha: null          # tiempo mínimo antes de cosecha
  efecto:
    d_a:   {dist: "beta", a: null, b: null}      # retira unidades afectadas
    kappa: {dist: "beta", a: null, b: null}      # reduce avance
    duracion_semanas: null
  costos:
    directo: null          # insumo/equipo
    jornales: null
    cert_penalizacion: null
    calidad_delta: null
  restricciones:
    incompatible_con_certificaciones: []
    periodo_de_carencia_semanas: 0     # semanas mínimas entre aplicación y cosecha
  requiere: []                         # insumos, equipos
  evidencia: "criterio_experto"        # criterio_experto | estimado | piloto
  fuente: null                         # quién la validó y cuándo
  paquete_de: []                       # si es combinación predefinida
```

**Qué entra en el catálogo (categorías iniciales a validar por extensión; el consejo no fija productos ni dosis):**

| Categoría | Ejemplos de acciones | Aplica a |
|---|---|---|
| Vigilancia | Re-medir en Δ semanas; consultar al técnico | Todas (siempre disponibles) |
| Manejo cultural | Poda/deshoje selectivo, manejo de sombrío, control de arvenses | Enfermedades foliares |
| Cosecha sanitaria | Recolección oportuna y repase | Broca |
| Nutrición | Ajuste de fertilización | Deficiencias, tolerancia |
| Control químico o biológico | Productos específicos según el técnico | Roya, broca |
| Renovación | Zoca o resiembra parcial | Lotes envejecidos o muy afectados |
| Protección financiera | Seguro, cobertura | Riesgo de cola alto (acción complementaria, no agronómica) |

> Las dosis, productos autorizados, eficacias y períodos de carencia **deben venir de fuentes técnicas oficiales (Cenicafé/extensión)** y cargarse en el catálogo con fecha y responsable. El sistema no debe proponer nada que no esté en el catálogo.

### 4.2 Cómo se generan y filtran las alternativas (en orden)

| Filtro | Criterio | Fuente de la información | Resultado si no pasa |
|---|---|---|---|
| **F0. Siempre presentes** | "No intervenir y re-medir" y "Consultar al técnico" | Siempre | — (son la línea base) |
| **F1. Aplicabilidad** | La clase detectada, el nivel y la etapa fenológica caen dentro de `aplica_a`, `nivel_min`, `ventana_fenologica` | RIESGO + perfil del lote | Se descarta |
| **F2. Factibilidad** | Tiempo a cosecha ≥ `semanas_min_a_cosecha` y ≥ período de carencia; compatible con las certificaciones del productor; insumo y equipo disponibles; **jornales disponibles esa semana**; costo ≤ caja + crédito disponible | Perfil del productor + catálogo | Se muestra como "inviable hoy" con la razón (no se oculta: el productor ve qué le impide hacerla) |
| **F3. Umbral económico** | `E[ΔM] = E[M_a] − E[M_nada] > 0` con probabilidad no despreciable | Cálculo del modelo de decisión | Se marca "no se justifica con los datos actuales" |
| **F4. Poda por dominancia** | Eliminar alternativas dominadas por otra (dominancia estocástica de segundo orden, o más caras con peor resultado) | Cálculo del modelo | Se oculta o se agrupa bajo "otras" |
| **F5. Límite de visualización** | Mostrar como máximo 4 alternativas principales + las 2 de línea base | Configuración | Se muestran las mejores por `CE` |

**Paquetes (combinaciones):** las combinaciones (p. ej. poda + control químico) existen solo como entradas predefinidas del catálogo (`paquete_de`). No se generan combinaciones automáticas, para evitar explosión combinatoria y combinaciones agronómicamente inválidas.

**Etiquetas obligatorias en pantalla por alternativa:** nivel de evidencia (criterio experto / estimado con datos propios / probado en piloto), costos ocultos desglosados, y si es "inviable hoy" con su razón.

### 4.3 Reglas de decisión en el tiempo (qué se mueve entre visitas)

- Si `P(M < 0)` es alta para **todas** las alternativas, la recomendación es "consultar al técnico y evaluar protección financiera".
- Si `valor_de_remedir > c_obs`, sugerir programar la visita en `Δ` semanas.
- Si la bandera `parametros_prior` está activa, la salida muestra una advertencia y **nunca** una recomendación única.

---

## 5. Cómo se conectan los dos modelos (resumen de variables que viajan)

| De | Hacia | Variable | Notas |
|---|---|---|---|
| Etapa 1 | Adaptador | clase, severidad, confianza, calidad, GPS, fecha, conteo | Contrato 1.1 |
| Adaptador | RIESGO | `n̂_s, m_eff, ρ` | Una cadena por enfermedad |
| Clima/caché | RIESGO | `w_i, Δ_i` | Semanal |
| Nube | RIESGO | `Λ, γ, g, κ, Ŷ0, Q̂` | Paquete versionado |
| RIESGO | DECISIÓN | partículas `{π0, π_T, w}`, `Ŷ0`, banderas | Es la creencia |
| Catálogo | DECISIÓN | acciones, costos, efectos, restricciones | Datos, no código |
| Nube | DECISIÓN | cuantiles de precio con antigüedad | Semanal |
| Productor | DECISIÓN | `θ, r, K, crédito, jornal` | Editables |
| DECISIÓN | Pantalla | ranking, costos ocultos, `OC`, valor de esperar y re-medir | Con evidencia y banderas |
| Seguimiento | Nube | acción tomada, costo real, cosecha real | Alimenta toda la calibración |

---

## 6. Qué hay que construir (backlog por módulo)

| # | Módulo | Qué hace | Depende de | Prioridad |
|---|---|---|---|---|
| 1 | **Generador sintético + arnés de pruebas** | Simula lotes, cadena, error de detector, panel y decisiones; ejecuta pruebas de propiedades | — | **P0** |
| 2 | **Adaptador de entrada** | Reglas 1.2; calcula `n̂_s, m_eff`, clima semanal | 1 | P0 |
| 3 | **Motor de RIESGO** | Capas M, D, L, U; partículas; ESS; banderas | 1, 2 | P0 |
| 4 | **Pipeline de calibración (nube)** | Estima `Λ, τ_s, γ_w, g, κ, Ŷ0, Q̂`; produce el paquete de parámetros versionado | 1, datos reales | P0 (con sintéticos), luego real |
| 5 | **Catálogo de acciones + validador de esquema** | Carga, valida y versiona fichas; muestra nivel de evidencia | Extensión técnica | P0 |
| 6 | **Motor de reglas (F0–F5)** | Genera alternativas elegibles | 5 | P1 |
| 7 | **Motor de DECISIÓN** | Árbol de 2 épocas, `CE`, `OC`, valores de esperar y re-medir | 3, 5, 6 | P1 |
| 8 | **Elicitación de `θ` y perfil editable** | Pantalla de apuesta 50/50 y supuestos editables | 7 | P1 |
| 9 | **Tabla de precios con antigüedad** | Sincronización semanal y ensanche por edad | Nube | P1 |
| 10 | **Conforme y monitoreo de deriva** | `Q̂`, cobertura realizada por temporada | 4 | P2 |
| 11 | **Captura de seguimiento** | "¿Qué hizo y qué pasó?" a las 4–8 semanas; cosecha real por lote | App | **P0 desde el piloto** |
| 12 | **Portación a móvil + vectores dorados** | Reimplementar y verificar contra la referencia | 3, 7 | P2 |
| 13 | **Pantallas de resultado** | Rangos, banderas, evidencia, costos ocultos, voz | 3, 7 | P1 |

---

## 7. Orden de construcción y criterios de aceptación

| Etapa | Entrega | Criterio de aceptación |
|---|---|---|
| **S0** | Generador sintético + arnés + contratos de datos | Las pruebas de propiedades (2.7 y 3.6) corren y fallan cuando se introduce un error deliberado |
| **S1** | Adaptador + RIESGO (sin conforme) | Con datos sintéticos recupera `π0` y la pérdida con sesgo bajo; todas las pruebas de 2.7 pasan |
| **S2** | Pipeline de calibración | Recupera los parámetros sintéticos conocidos; identificabilidad verificada (se estiman bien `g` y `τ_s` por separado) |
| **S3** | Catálogo + reglas + DECISIÓN | Pruebas de 3.6 pasan; alternativas coinciden con las reglas F0–F5 en casos sintéticos |
| **S4** | Conforme, banderas, precios, elicitación | Cobertura sintética cercana a la nominal; banderas se activan en los casos diseñados |
| **S5** | Portación móvil + piloto de campo | Vectores dorados coinciden dentro de la tolerancia; cierre del ciclo de seguimiento con productores reales |

**Regla de parada:** si en el piloto el modelo de RIESGO **no supera a una línea base simple** (regresión con severidad y clima) fuera de muestra, no se activa la recomendación automática; se mantiene el modo informativo.

---

## 8. Paquete de parámetros para el teléfono

Un archivo versionado y firmado, actualizado cuando hay señal:

```
{
  "version": "AAAA-MM-DD-vN",
  "lambda": [[...]],                       // matriz de confusión
  "draws": {"gamma": [...S muestras...], "g": [...], "kappa": [...]},
  "yield_model": {"coef": {...}, "residual_scale": ...},
  "conformal_Q": ...,
  "umbrales_niveles": {"roya": [...], "broca": [...]},
  "catalogo_acciones": [...],
  "precios": {"fecha": "...", "cuantiles": {...}},
  "estado_evidencia": {"gamma": "prior|estimado", "g": "...", "kappa_a": "..."}
}
```

Se llevan `S` muestras posteriores (unos cientos) en lugar del algoritmo de estimación. El teléfono solo muestrea de ellas; no ajusta modelos.

---

## 9. Libro de supuestos (resumen)

| ID | Supuesto | Qué pasa si falla | Cómo se vigila |
|---|---|---|---|
| A1 | Errores del detector dependen solo del nivel verdadero y `Λ` se transfiere del conjunto validado al campo | Corrección sesgada | Submuestra de campo con etiqueta de experto |
| A2 | `Λ[s,s] > 0,5` | No se puede corregir | Bandera `detector_no_corregible` |
| A3 | Unidades condicionalmente independientes tras corregir por `m_eff` | Intervalos demasiado estrechos | `ρ` estimado; autocorrelación espacial de residuos |
| A4 | Progresión markoviana solo ascendente | Mala dinámica | Frecuencia de "bajadas" mayor al error esperado |
| A5 | Efecto climático log-lineal | Mala dinámica | Residuos vs. clima |
| A6 | `g` monótona y estable entre temporadas | Pérdida mal calibrada | Validación dejando fuera una temporada |
| A7 | Severidad exógena en el panel (condicional a efectos fijos y controles) | `g` sesgada | Placebos, tendencias previas |
| A8 | Lotes de calibración intercambiables con los nuevos | Cobertura real menor | Cobertura realizada por temporada |
| A9 | Efecto de acciones causalmente identificado sin interferencia entre vecinos | Solo cotas | Piloto aleatorizado por vereda |
| A10 | Precio independiente de la pérdida del lote | Cola subestimada | Correlación pérdida–precio por cooperativa |
| A11 | La utilidad exponencial describe al productor | Recomendación mal alineada | Consistencia de la elicitación entre montos |
| A12 | Una cadena por enfermedad, con pérdidas combinadas como `1−ℓ = ∏(1−ℓ_k)` | Interacciones ignoradas | Comparar con pérdidas observadas en lotes con dos plagas |

**El contrafactual de pérdida es el punto más débil del sistema.** La pérdida sin plaga no se observa; solo se aproxima con el panel (A7). Sin al menos dos temporadas de cosecha por lote, la calibración de `g` descansa en la jerarquía regional y en el criterio técnico, y la app debe decirlo.

---

## 10. Generador de datos sintéticos (especificación mínima)

Sirve para probar todo antes de tener datos reales. Debe simular:

1. **Lotes y clima:** `J` lotes en `C` cooperativas, con clima semanal aleatorio (covariable `w`).
2. **Dinámica real:** cadena de Markov con parámetros verdaderos conocidos `(τ_s, γ_w)`; visitas en fechas irregulares.
3. **Detector:** salida de nivel `ŝ` generada con una `Λ` verdadera conocida (incluyendo casos con `Λ[s,s] < 0,5`).
4. **Daño y rendimiento:** `g` verdadera conocida, `κ`, efectos fijos de lote y cooperativa, bienalidad; `Y` observado.
5. **Acciones y seguimiento:** acciones con `κ_a`, `d_a` verdaderos; decisiones y resultados simulados.
6. **Precio:** serie con distribución conocida, con edad variable.

**Qué se prueba con él:**
- Que el estimador recupere `π0`, `Λ`, `τ_s`, `γ_w`, `g`, `κ` con sesgo bajo.
- Que la cobertura conforme sea la nominal.
- Que la política de decisión sea la óptima conocida en casos pequeños resueltos a mano.
- Que las banderas se activen cuando se rompen los supuestos de forma deliberada.

---

## 11. Lo que el sistema debe decirle siempre al productor

1. **Un rango, no un número**, con el nivel de evidencia.
2. **Qué se asumió** (jornal, precio, tasa) y que puede editarlo.
3. **Qué es criterio técnico y qué son datos propios** (bandera de parámetros *prior*).
4. **Por qué una alternativa no está disponible hoy** (liquidez, plazo, certificación).
5. **Que es apoyo a la decisión, no sustituto del técnico.**

---

*Documento de trabajo. Las formulaciones requieren revisión formal del matemático y el econometrista; los valores agronómicos, costos y umbrales deben ser aportados y firmados por extensión técnica antes de uso con productores.*
