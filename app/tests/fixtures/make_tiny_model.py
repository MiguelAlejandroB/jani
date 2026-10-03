"""Genera tiny_model.onnx, modelo SOLO de prueba (nunca va a public/models).

Grafo: GlobalAveragePool -> Flatten -> Gemm(transB=1). Entrada `input` [1,3,224,224], salida `logits` [1,5].
Uso (desde la raiz del repo): .venv/Scripts/python app/tests/fixtures/make_tiny_model.py
"""
from pathlib import Path

import numpy as np
import onnx
from onnx import TensorProto, helper, numpy_helper

W = np.array(
    [[1, 0, 0], [0, 1, 0], [0, 0, 1], [1, 1, 1], [-1, 0, 1]],
    dtype=np.float32,
)
B = np.array([0.0, 0.5, -0.5, 0.25, 0.0], dtype=np.float32)

nodes = [
    helper.make_node("GlobalAveragePool", ["input"], ["pooled"]),
    helper.make_node("Flatten", ["pooled"], ["flat"], axis=1),
    helper.make_node("Gemm", ["flat", "W", "b"], ["logits"], transB=1),
]
graph = helper.make_graph(
    nodes,
    "tiny",
    [helper.make_tensor_value_info("input", TensorProto.FLOAT, [1, 3, 224, 224])],
    [helper.make_tensor_value_info("logits", TensorProto.FLOAT, [1, 5])],
    initializer=[numpy_helper.from_array(W, "W"), numpy_helper.from_array(B, "b")],
)
model = helper.make_model(graph, opset_imports=[helper.make_opsetid("", 13)])
model.ir_version = 8
onnx.checker.check_model(model)
out = Path(__file__).parent / "tiny_model.onnx"
onnx.save(model, out)
print("escrito", out)
