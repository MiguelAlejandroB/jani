# Resultados del modelo de visión (SEE) — corrida 1

Entrenamiento ejecutado en Colab (GPU T4) con `training/jani_train.ipynb`, 8 épocas por modelo, 224×224.
Fecha: octubre de 2026. Todas las cifras salen del registro de la corrida; ninguna es estimada.

> **Resumen honesto.** Dentro del dataset de entrenamiento el modelo acierta el 100 %, pero ese número no sirve:
> en fotos de **otros países**, que nunca vio, acierta entre **25 % y 89 %** según el país. Además, la calibración de
> confianza de esta corrida quedó mal hecha (ver §4), por lo que la app casi nunca diría "no estoy segura" ante una
> enfermedad desconocida. **Esta corrida no se debe usar en la demo tal cual**: se corrige con una segunda corrida (§6).

## 1. Qué se entrenó

| | |
|---|---|
| Tarea | Clasificar una hoja de arábica en 5 clases: sana, roya, minador, phoma, cercospora |
| Modelos | EfficientNet-Lite0 y MobileNetV3-Small, preentrenados en ImageNet (`timm`) |
| Entrenamiento | JMuBEN (Kenia, CC BY 4.0), balanceado a 6.500 fotos por clase (27.625 entrenamiento, 4.875 validación) + hojas completas de BRACOL (Brasil, CC BY 4.0) |
| Prueba fuera de distribución | **Uganda** (sana, roya, phoma) y **Perú** (sana, roya, ojo de gallo). El modelo nunca las vio. Cada una se divide en dos mitades: una para elegir el umbral y otra para reportar |
| Exportación | ONNX fp32 y cuantizado int8 (por canal), evaluado sin optimizaciones de grafo, igual que en el teléfono (onnxruntime-web) |

## 2. Resultados

### 2.1 Dentro de distribución (JMuBEN, validación)

| Modelo | Precisión |
|---|---|
| EfficientNet-Lite0 | 100 % (4.875 fotos) |
| MobileNetV3-Small | 100 % (4.875 fotos) |

**No es representativo.** JMuBEN trae aumentación (copias rotadas de la misma hoja), así que validación y
entrenamiento comparten hojas casi idénticas.

### 2.2 Fuera de distribución (el número honesto, mitad de prueba)

Evaluado en PyTorch, con el umbral elegido en la otra mitad.

| Modelo | Uganda (n = 1.500) | Perú (n = 200) |
|---|---|---|
| **EfficientNet-Lite0** | **32,7 %** (responde 87,9 %; acierta 33,1 % cuando responde) | **88,5 %** (responde 93,0 %; acierta 90,3 % cuando responde) |
| MobileNetV3-Small | 24,7 % (responde 99,1 %; acierta 24,8 %) | 58,0 % (responde 98,0 %; acierta 57,7 %) |

Detalle por clase, EfficientNet-Lite0:

| País | Clase | Precisión | Recall (de las que lo eran, cuántas encontró) |
|---|---|---|---|
| Uganda | sana | 1,00 | **0,07** |
| Uganda | roya | 0,59 | 0,40 |
| Uganda | phoma | 0,38 | 0,52 |
| Perú | sana | 0,94 | 1,00 |
| Perú | roya | 1,00 | 0,77 |

### 2.3 Enfermedad que el modelo no conoce (ojo de gallo, Perú, n = 199)

| Modelo | Dice "no estoy segura" |
|---|---|
| EfficientNet-Lite0 | 6 % |
| MobileNetV3-Small | 3 % |

Lo ideal sería cerca de 100 %. Ver §4: es consecuencia de la mala calibración.

### 2.4 Exportación al teléfono

Mitad de prueba de Uganda + Perú (mayoritariamente Uganda), con la aritmética de onnxruntime-web:

| Modelo | Archivo | Tamaño | Precisión | Tiempo por foto (CPU de Colab) |
|---|---|---|---|---|
| EfficientNet-Lite0 | fp32 | 13,46 MB | 39,7 % | 40 ms |
| EfficientNet-Lite0 | **int8** | **3,8 MB** | **38,3 %** (pierde 1,4 puntos) | 44 ms |
| MobileNetV3-Small | fp32 | 6,1 MB | 28,7 % | 12 ms |
| MobileNetV3-Small | int8 | 1,86 MB | 51,3 % (**gana 22,5 puntos**, anómalo) | 15 ms |

## 3. Cómo leer estos números

1. **La brecha laboratorio → campo es real y grande.** Pasa de 100 % en el dataset de origen a 33 % en Uganda y 89 % en
   Perú. Es exactamente el riesgo número 1 que señala la propuesta ("brecha laboratorio-campo"). JMuBEN son hojas
   recortadas sobre fondo uniforme; Uganda y Perú son fotos de otro estilo, otras cámaras y otras fincas.
2. **Perú va bien, Uganda muy mal.** En Uganda el modelo casi nunca reconoce una hoja sana (recall 0,07): ve
   "enfermedad" en hojas sanas. Esto sugiere un cambio fuerte de estilo de foto (fondo, luz, encuadre), no solo de país.
3. **EfficientNet-Lite0 es mejor modelo que MobileNetV3-Small** en ambos países (33 % contra 25 % en Uganda y 89 % contra 58 % en Perú).
4. **El ganador automático de la corrida (MobileNetV3 int8) fue un error de selección.** Que un modelo *mejore* 22,5
   puntos al cuantizarlo no es una mejora: significa que la cuantización cambió mucho sus predicciones y por azar le
   fue mejor en Uganda. Es un modelo inestable. Además, la puntuación mezclaba Uganda y Perú por cantidad de fotos, con
   lo que Uganda (1.500) pesaba siete veces más que Perú (200).

## 4. Problemas del notebook detectados en esta corrida (y su arreglo)

| Problema | Efecto | Arreglo para la corrida 2 |
|---|---|---|
| La temperatura se calibró con la validación de JMuBEN, donde el modelo acierta el 100 % | Temperatura de 0,24 y 0,13: el modelo quedó **sobreconfiado** (probabilidades cercanas a 1 en todo). La tabla de umbrales es plana (~41 % de acierto con cualquier umbral) y casi nunca dice "no estoy segura" | Calibrar la temperatura y el umbral con la mitad de calibración de **Uganda y Perú** |
| Selección del modelo por precisión del int8, ponderada por cantidad de fotos | Ganó un modelo inestable | Elegir por el **promedio de los dos países** (cada uno pesa igual) con el modelo fp32. Aceptar el int8 solo si difiere ≤ 2 puntos del fp32 **en cualquier dirección** |
| Uganda solo como prueba | Ninguna foto de campo en el entrenamiento | Opción recomendada: usar una parte de Uganda para entrenar (adaptación a fotos de campo) y dejar **Perú completamente sin ver** como prueba honesta |

## 5. Qué decir en la hackathon (versión honesta)

- "Entrenamos con 33.000 hojas de Kenia y Brasil y **probamos en Uganda y Perú, que el modelo nunca vio**."
- "En Perú acierta el **89 %**. En Uganda el 33 %: la diferencia entre fotos de laboratorio y de campo es enorme, y por
  eso Jani **no decide sola**: junta cinco hojas, dice 'no estoy segura' y deriva a una persona."
- "El modelo pesa **3,8 MB** y corre en el teléfono, sin internet, en unos 40 ms por foto en CPU."
- No decir "100 % de precisión": es la validación inflada.

## 6. Recomendación

1. **No usar** el `model_int8.onnx` de MobileNetV3 que salió en `jani_model.zip`.
2. **Hacer la corrida 2** con los tres arreglos de §4 (calibración externa, selección balanceada y parte de Uganda en
   el entrenamiento). Debería mejorar sobre todo Uganda y la capacidad de decir "no estoy segura".
3. Si no hay tiempo para la corrida 2: usar **EfficientNet-Lite0 int8 (3,8 MB)**. Su archivo quedó en la carpeta
   `jani_model/efficientnet_lite0/` de Colab, no en el zip. Hay que recalibrar su temperatura, porque con 0,24 el
   "no estoy segura" casi no funciona.

## 7. Corrida 2: qué cambia en el notebook

Preparado tras analizar la corrida 1 y **probado con los datos reales** (descarga, limpieza y reparto ejecutados
localmente contra Mendeley) y con una ejecución completa de punta a punta en modo de prueba.

| Cambio | Por qué |
|---|---|
| **Limpieza de datos externos** | En Uganda, de 3.000 fotos: **1.310 son duplicados exactos**, 102 están vacías o dañadas y 20 aparecen en dos clases a la vez. Quedan ~1.570 fotos útiles. BRACOL trae 1 imagen truncada. |
| **Reparto por hoja** | Las copias de una misma foto (giradas, espejadas, con otro tono) se detectan por textura y quedan siempre del mismo lado. Medido con datos reales: copias ≥ 0,94 de parecido; hojas distintas ≤ 0,49 (umbral 0,80). |
| **Parte de Uganda para entrenar** | 40 % entrenamiento, 20 % calibración, 40 % prueba, repartido por hoja. Así el modelo ve fotos de campo y no solo el estilo de JMuBEN. En cada época, 1 de cada 4 fotos es de campo (Uganda + BRACOL). |
| **Perú nunca se entrena** | 50 % calibración, 50 % prueba. Es la prueba honesta en un país que el modelo no vio. |
| **Calibración con fotos de campo** | Temperatura y umbral con la calibración de Uganda + Perú (cada país pesa igual), no con la validación inflada. La tabla del umbral ahora también muestra cuántas veces dice "no estoy segura" ante ojo de gallo. |
| **Mejor época según campo** | Se guarda la época con mejor precisión en la calibración de campo, no en la validación de JMuBEN (que llega al 100 % y no distingue). |
| **Selección del modelo** | Precisión media por país (cada país pesa igual). El int8 se usa solo si su precisión media difiere ≤ 2 puntos del fp32 **y** responde distinto en ≤ 5 % de las fotos; si no, se descarta por inestable. |
| **Descargas más robustas** | La API de Mendeley respondió 503 en una prueba: ahora se reintenta con espera creciente. |

**Qué número mirar al terminar:** la tabla `RESUMEN` del final (Uganda, Perú y promedio con la aritmética del teléfono)
y la línea de Perú, que es el país nunca visto.
