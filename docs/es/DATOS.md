# Datos: fuentes, licencias, tamaños y límites

El reto exige nombrar cada dataset, su fuente, licencia y tamaño, y decir qué **no** cubre.

## Datos con los que se construye

| Dataset | País | Tamaño | Clases | Licencia | Uso | Enlace |
|---|---|---|---|---|---|---|
| JMuBEN + JMuBEN2 | Kenia | 58.549 imágenes | sana, roya, minador, phoma, cercospora | CC BY 4.0 (ficha de Hugging Face) | Entrenamiento | https://huggingface.co/datasets/Project-AgML/arabica_coffee_leaf_disease_classification |
| BRACOL | Brasil | 1.747 hojas, 2.147 recortes | mismas 5, con severidad | CC BY 4.0 (página de Mendeley, revisado 2026-10-03) | Entrenamiento | https://data.mendeley.com/datasets/yy2k5y8mxg/1 |
| Uganda (Soroti University) | Uganda | 3.312 imágenes | sana, roya, phoma | CC BY 4.0 (API de Mendeley, revisado 2026-10-03) | Solo prueba externa | https://data.mendeley.com/datasets/k36wnd6knb/1 |
| Perú (Saposoa) | Perú | 1.500 imágenes | sana, roya, ojo de gallo | CC BY 4.0 (API de Mendeley, revisado 2026-10-03) | Solo prueba externa | https://data.mendeley.com/datasets/mfpxg4y65r/1 |

## Datos previstos, no usados en el MVP

| Dataset | País | Tamaño | Licencia | Por qué no entra | Enlace |
|---|---|---|---|---|---|
| CoLeaf-DB | Perú | 902 imágenes, 9 clases | CC BY 4.0 (ficha de Hugging Face) | Solo 6 hojas sanas: no permite separar "deficiencia" de "estilo de foto" | https://huggingface.co/datasets/Project-AgML/CoLeaf_nutritional_deficiency_classification |
| RoCoLe | Ecuador | 1.560 imágenes de robusta | **Por confirmar** | Paquete de robusta, a futuro | https://data.mendeley.com/datasets/c5yvn32dzg/2 |

## Citas

- Jepkoech, J., Mugo, D. M., Kenduiywo, B. K., Too, E. C. (2021). Arabica coffee leaf images dataset for coffee leaf disease detection and classification. *Data in Brief*, 36, 107142. DOI de los datos: 10.17632/t2r6rszp5c.1 y 10.17632/tgv3zb82nd.1
- Krohling, R. A., Esgario, G. J. M., Ventura, J. A. (2019). BRACOL. Mendeley Data, V1. DOI: 10.17632/yy2k5y8mxg.1
- Uganda: Mendeley Data, V1 (2025). DOI: 10.17632/k36wnd6knb.1. **Completar autores desde la página.**
- Perú: Mendeley Data, V1 (2026). DOI: 10.17632/mfpxg4y65r.1. **Completar autores desde la página.**
- Tuesta-Monteza, V. A., Mejia-Cabrera, H. I., Arcila-Diaz, J. (2023). CoLeaf-DB. *Data in Brief*, 48, 109226. DOI de los datos: 10.17632/brfgw46wzb.2
- Parraga-Alava, J., Cusme, K., Loor, A., Santander, E. (2019). RoCoLe. Mendeley Data, V2. DOI: 10.17632/c5yvn32dzg.2

## Lo que estos datos no cubren

- **Campo real.** JMuBEN son hojas recortadas; BRACOL son hojas sobre fondo blanco, por el envés. Las fotos de una caficultora en su lote tienen fondo, sombra y varias hojas.
- **Geografía.** Se entrena con Kenia y Brasil. No hay datos de entrenamiento de Colombia, Etiopía, Vietnam ni Centroamérica.
- **Especie.** Solo arábica.
- **Parte de la planta.** Solo hojas. No cubre frutos (broca, antracnosis del fruto) ni tallos o raíces.
- **Enfermedades.** Solo cuatro. No cubre ojo de gallo, antracnosis, mal rosado ni deficiencias nutricionales.
- **Aumentación previa.** JMuBEN incluye copias transformadas, así que la precisión de validación interna está inflada. La cifra válida es la de Uganda y Perú.
- **Severidad.** El modelo no estima severidad; la app la aproxima con la proporción de hojas afectadas en la sesión.

## Datos del problema (para la frase del video)

Completar con fuente, año y país: cobertura de extensión agrícola, brecha de smartphone en mujeres (GSMA), rendimiento de café (FAOSTAT), pérdidas por roya (literatura).

## Datos sintéticos y de demostración

- `demo_values` en cada `pack.json`: rendimiento, precio, costo de tratamiento, rangos de pérdida y meses lluviosos **de demostración**. No son datos reales. La app los marca con una etiqueta visible. Reemplazarlos por valores con fuente antes de presentarlos como evidencia.
- Reglas de riesgo (`risk_rules`): puntos de partida, pendientes de validación por el ingeniero agrícola.

## Voz

- Audio en suajili: sintético, modelo MMS-TTS de Meta (`facebook/mms-tts-swh`). Licencia no comercial (CC BY-NC 4.0, **confirmar en la ficha del modelo**). Frases sin validar por hablante nativo.
- Audio en español: indicar si es voz grabada por el equipo o sintética (`facebook/mms-tts-spa`).
