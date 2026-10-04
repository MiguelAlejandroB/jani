# Vision model (SEE) results — run 1

Training run on Colab (T4 GPU) with `training/jani_train.ipynb`, 8 epochs per model, 224×224.
Date: October 2026. All figures come from the run log; none are estimated.

> **Honest summary.** Within the training dataset the model is 100% accurate, but that number is useless:
> on photos from **other countries**, which it never saw, it is between **25% and 89%** accurate depending on the country. In addition, the confidence
> calibration of this run was done badly (see §4), so the app would almost never say "I am not sure" when faced with an unknown
> disease. **This run must not be used in the demo as is**: it is fixed with a second run (§6).

## 1. What was trained

| | |
|---|---|
| Task | Classify an arabica leaf into 5 classes: healthy, rust, miner, phoma, cercospora |
| Models | EfficientNet-Lite0 and MobileNetV3-Small, pretrained on ImageNet (`timm`) |
| Training | JMuBEN (Kenya, CC BY 4.0), balanced to 6,500 photos per class (27,625 training, 4,875 validation) + whole leaves from BRACOL (Brazil, CC BY 4.0) |
| Out-of-distribution test | **Uganda** (healthy, rust, phoma) and **Peru** (healthy, rust, ojo de gallo). The model never saw them. Each is split into two halves: one to choose the threshold and the other to report |
| Export | ONNX fp32 and quantized int8 (per channel), evaluated without graph optimizations, same as on the phone (onnxruntime-web) |

## 2. Results

### 2.1 In distribution (JMuBEN, validation)

| Model | Accuracy |
|---|---|
| EfficientNet-Lite0 | 100% (4,875 photos) |
| MobileNetV3-Small | 100% (4,875 photos) |

**Not representative.** JMuBEN includes augmentation (rotated copies of the same leaf), so validation and
training share nearly identical leaves.

### 2.2 Out of distribution (the honest number, test half)

Evaluated in PyTorch, with the threshold chosen on the other half.

| Model | Uganda (n = 1,500) | Peru (n = 200) |
|---|---|---|
| **EfficientNet-Lite0** | **32.7%** (answers 87.9%; correct 33.1% when it answers) | **88.5%** (answers 93.0%; correct 90.3% when it answers) |
| MobileNetV3-Small | 24.7% (answers 99.1%; correct 24.8%) | 58.0% (answers 98.0%; correct 57.7%) |

Per-class detail, EfficientNet-Lite0:

| Country | Class | Precision | Recall (of those that were that class, how many it found) |
|---|---|---|---|
| Uganda | healthy | 1.00 | **0.07** |
| Uganda | rust | 0.59 | 0.40 |
| Uganda | phoma | 0.38 | 0.52 |
| Peru | healthy | 0.94 | 1.00 |
| Peru | rust | 1.00 | 0.77 |

### 2.3 A disease the model does not know (ojo de gallo, Peru, n = 199)

| Model | Says "I am not sure" |
|---|---|
| EfficientNet-Lite0 | 6% |
| MobileNetV3-Small | 3% |

Ideally this would be close to 100%. See §4: it is a consequence of the poor calibration.

### 2.4 Export to the phone

Test half of Uganda + Peru (mostly Uganda), using onnxruntime-web arithmetic:

| Model | File | Size | Accuracy | Time per photo (Colab CPU) |
|---|---|---|---|---|
| EfficientNet-Lite0 | fp32 | 13.46 MB | 39.7% | 40 ms |
| EfficientNet-Lite0 | **int8** | **3.8 MB** | **38.3%** (loses 1.4 points) | 44 ms |
| MobileNetV3-Small | fp32 | 6.1 MB | 28.7% | 12 ms |
| MobileNetV3-Small | int8 | 1.86 MB | 51.3% (**gains 22.5 points**, anomalous) | 15 ms |

## 3. How to read these numbers

1. **The lab → field gap is real and large.** It goes from 100% on the source dataset to 33% in Uganda and 89% in
   Peru. This is exactly risk number 1 that the proposal points out ("lab-field gap"). JMuBEN consists of cropped
   leaves on a uniform background; Uganda and Peru are photos of a different style, other cameras and other farms.
2. **Peru does well, Uganda very badly.** In Uganda the model almost never recognizes a healthy leaf (recall 0.07): it sees
   "disease" in healthy leaves. This suggests a strong change of photo style (background, light, framing), not just of country.
3. **EfficientNet-Lite0 is a better model than MobileNetV3-Small** in both countries (33% versus 25% in Uganda and 89% versus 58% in Peru).
4. **The automatic winner of the run (MobileNetV3 int8) was a selection error.** A model that *improves* by 22.5
   points when quantized is not an improvement: it means quantization changed its predictions a lot and by chance it
   did better in Uganda. It is an unstable model. In addition, the score mixed Uganda and Peru by number of photos, so
   Uganda (1,500) weighed seven times more than Peru (200).

## 4. Notebook problems detected in this run (and their fix)

| Problem | Effect | Fix for run 2 |
|---|---|---|
| The temperature was calibrated with the JMuBEN validation, where the model is 100% accurate | Temperatures of 0.24 and 0.13: the model ended up **overconfident** (probabilities close to 1 everywhere). The threshold table is flat (~41% accuracy at any threshold) and it almost never says "I am not sure" | Calibrate the temperature and the threshold with the calibration half of **Uganda and Peru** |
| Model selection by int8 accuracy, weighted by number of photos | An unstable model won | Choose by the **average of the two countries** (each weighs the same) using the fp32 model. Accept the int8 only if it differs ≤ 2 points from the fp32 **in either direction** |
| Uganda used only as a test | No field photos in training | Recommended option: use part of Uganda for training (adaptation to field photos) and leave **Peru completely unseen** as the honest test |

## 5. What to say at the hackathon (honest version)

- "We trained on 33,000 leaves from Kenya and Brazil and **tested on Uganda and Peru, which the model never saw**."
- "In Peru it is **89%** accurate. In Uganda 33%: the difference between lab photos and field photos is enormous, and that is
  why Jani **does not decide alone**: it gathers five leaves, says 'I am not sure' and refers to a person."
- "The model weighs **3.8 MB** and runs on the phone, without internet, in about 40 ms per photo on CPU."
- Do not say "100% accuracy": it is the inflated validation.

## 6. Recommendation

1. **Do not use** the MobileNetV3 `model_int8.onnx` that came out in `jani_model.zip`.
2. **Do run 2** with the three fixes of §4 (external calibration, balanced selection and part of Uganda in
   training). It should improve mainly Uganda and the ability to say "I am not sure".
3. If there is no time for run 2: use **EfficientNet-Lite0 int8 (3.8 MB)**. Its file stayed in the Colab folder
   `jani_model/efficientnet_lite0/`, not in the zip. Its temperature has to be recalibrated, because at 0.24 the
   "I am not sure" barely works.

## 7. Run 2: what changes in the notebook

Prepared after analyzing run 1 and **tested with the real data** (download, cleaning and split executed
locally against Mendeley) and with a full end-to-end execution in test mode.

| Change | Why |
|---|---|
| **Cleaning of external data** | In Uganda, of 3,000 photos: **1,310 are exact duplicates**, 102 are empty or corrupted and 20 appear in two classes at once. About 1,570 useful photos remain. BRACOL has 1 truncated image. |
| **Split by leaf** | Copies of the same photo (rotated, mirrored, with a different tone) are detected by texture and always end up on the same side. Measured with real data: copies ≥ 0.94 similarity; different leaves ≤ 0.49 (threshold 0.80). |
| **Part of Uganda for training** | 40% training, 20% calibration, 40% test, split by leaf. This way the model sees field photos and not just the JMuBEN style. In each epoch, 1 in 4 photos is a field photo (Uganda + BRACOL). |
| **Peru is never trained on** | 50% calibration, 50% test. It is the honest test in a country the model did not see. |
| **Calibration with field photos** | Temperature and threshold with the Uganda + Peru calibration (each country weighs the same), not with the inflated validation. The threshold table now also shows how often it says "I am not sure" when faced with ojo de gallo. |
| **Best epoch according to field** | The epoch with the best accuracy on the field calibration is saved, not on the JMuBEN validation (which reaches 100% and does not discriminate). |
| **Model selection** | Mean accuracy per country (each country weighs the same). The int8 is used only if its mean accuracy differs ≤ 2 points from the fp32 **and** it answers differently on ≤ 5% of the photos; otherwise it is discarded as unstable. |
| **More robust downloads** | The Mendeley API returned 503 in a test: it is now retried with increasing wait. |

**Which number to look at when it finishes:** the `RESUMEN` (summary) table at the end (Uganda, Peru and average with the phone's arithmetic)
and the Peru line, which is the never-seen country.
