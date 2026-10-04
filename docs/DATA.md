# Data: sources, licenses, sizes and limits

The challenge requires naming each dataset, its source, license and size, and stating what it does **not** cover.

## Data used to build the system

| Dataset | Country | Size | Classes | License | Use | Link |
|---|---|---|---|---|---|---|
| JMuBEN + JMuBEN2 | Kenya | 58,549 images | healthy, rust, miner, phoma, cercospora | CC BY 4.0 (Hugging Face card) | Training | https://huggingface.co/datasets/Project-AgML/arabica_coffee_leaf_disease_classification |
| BRACOL | Brazil | 1,747 leaves, 2,147 crops | same 5, with severity | CC BY 4.0 (Mendeley page, checked 2026-10-03) | Training | https://data.mendeley.com/datasets/yy2k5y8mxg/1 |
| Uganda (Soroti University) | Uganda | 3,312 images | healthy, rust, phoma | CC BY 4.0 (Mendeley API, checked 2026-10-03) | External test only | https://data.mendeley.com/datasets/k36wnd6knb/1 |
| Peru (Saposoa) | Peru | 1,500 images | healthy, rust, ojo de gallo (American leaf spot) | CC BY 4.0 (Mendeley API, checked 2026-10-03) | External test only | https://data.mendeley.com/datasets/mfpxg4y65r/1 |

## Planned data, not used in the MVP

| Dataset | Country | Size | License | Why it is not included | Link |
|---|---|---|---|---|---|
| CoLeaf-DB | Peru | 902 images, 9 classes | CC BY 4.0 (Hugging Face card) | Only 6 healthy leaves: it does not allow separating "deficiency" from "photo style" | https://huggingface.co/datasets/Project-AgML/CoLeaf_nutritional_deficiency_classification |
| RoCoLe | Ecuador | 1,560 robusta images | **To be confirmed** | Robusta pack, for the future | https://data.mendeley.com/datasets/c5yvn32dzg/2 |

## Citations

- Jepkoech, J., Mugo, D. M., Kenduiywo, B. K., Too, E. C. (2021). Arabica coffee leaf images dataset for coffee leaf disease detection and classification. *Data in Brief*, 36, 107142. Data DOI: 10.17632/t2r6rszp5c.1 and 10.17632/tgv3zb82nd.1
- Krohling, R. A., Esgario, G. J. M., Ventura, J. A. (2019). BRACOL. Mendeley Data, V1. DOI: 10.17632/yy2k5y8mxg.1
- Uganda: Mendeley Data, V1 (2025). DOI: 10.17632/k36wnd6knb.1. **Fill in the authors from the page.**
- Peru: Mendeley Data, V1 (2026). DOI: 10.17632/mfpxg4y65r.1. **Fill in the authors from the page.**
- Tuesta-Monteza, V. A., Mejia-Cabrera, H. I., Arcila-Diaz, J. (2023). CoLeaf-DB. *Data in Brief*, 48, 109226. Data DOI: 10.17632/brfgw46wzb.2
- Parraga-Alava, J., Cusme, K., Loor, A., Santander, E. (2019). RoCoLe. Mendeley Data, V2. DOI: 10.17632/c5yvn32dzg.2

## What this data does not cover

- **Real field conditions.** JMuBEN consists of cropped leaves; BRACOL consists of leaves on a white background, photographed from the underside. A coffee farmer's photos taken on her plot have a background, shadows and several leaves.
- **Geography.** Training uses Kenya and Brazil. There is no training data from Colombia, Ethiopia, Vietnam or Central America.
- **Species.** Arabica only.
- **Plant part.** Leaves only. It does not cover fruit (coffee berry borer, fruit anthracnose) or stems and roots.
- **Diseases.** Only four. It does not cover ojo de gallo (American leaf spot), anthracnose, pink disease or nutritional deficiencies.
- **Prior augmentation.** JMuBEN includes transformed copies, so internal validation accuracy is inflated. The valid figure is the one from Uganda and Peru.
- **Severity.** The model does not estimate severity; the app approximates it with the proportion of affected leaves in the session.

## Problem data (for the video script)

Fill in with source, year and country: agricultural extension coverage, smartphone gap among women (GSMA), coffee yield (FAOSTAT), rust losses (literature).

## Synthetic and demo data

- `demo_values` in each `pack.json`: **demo** yield, price, treatment cost, loss ranges and rainy months. They are not real data. The app marks them with a visible label. Replace them with sourced values before presenting them as evidence.
- Risk rules (`risk_rules`): starting points, pending validation by the agricultural engineer.

## Voice

- Swahili audio: synthetic, Meta's MMS-TTS model (`facebook/mms-tts-swh`). Non-commercial license (CC BY-NC 4.0, **confirm on the model card**). Phrases not validated by a native speaker.
- Spanish audio: state whether it is a voice recorded by the team or synthetic (`facebook/mms-tts-spa`).
