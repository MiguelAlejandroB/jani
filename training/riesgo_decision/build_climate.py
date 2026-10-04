"""Clima semanal normal por punto cafetero (NASA POWER, diario 2001–2024) para los paquetes.

Para cada punto: normal por semana del año (1..52) de [tmax, hr, lluvia] y su anomalía estandarizada respecto a lo
normal de ESE lugar (lo que usa el modelo de RIESGO, supuesto A5'). La app elige el punto más cercano a la ubicación
del teléfono (GPS, sin internet); si no hay permiso usa el punto por defecto del paquete.

Coordenadas aproximadas de cabeceras municipales (la grilla de NASA POWER es de ~0,5°: una diferencia de 0,1° no
cambia de celda en la mayoría de los casos).

Uso:  ..\\..\\.venv\\Scripts\\python build_climate.py   ->  data/clima_puntos.json
"""
import json
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from jani_rd.real_data import nasa_daily, weekly_climate  # noqa: E402

REGIONS = {
    "colombia": [
        ("Chinchiná, Caldas", 4.98, -75.60), ("Salamina, Caldas", 5.40, -75.49), ("Belén de Umbría, Risaralda", 5.20, -75.87),
        ("Calarcá, Quindío", 4.53, -75.64), ("Sevilla, Valle del Cauca", 4.27, -75.93), ("Trujillo, Valle del Cauca", 4.21, -76.32),
        ("Andes, Antioquia", 5.66, -75.88), ("Ciudad Bolívar, Antioquia", 5.85, -76.02), ("Fredonia, Antioquia", 5.93, -75.67),
        ("Concordia, Antioquia", 6.05, -75.91), ("Pitalito, Huila", 1.85, -76.05), ("Garzón, Huila", 2.20, -75.63),
        ("La Plata, Huila", 2.39, -75.89), ("Gigante, Huila", 2.39, -75.55), ("Popayán, Cauca", 2.44, -76.61),
        ("Inzá, Cauca", 2.55, -76.06), ("El Tambo, Cauca", 2.45, -76.81), ("La Unión, Nariño", 1.60, -77.13),
        ("Buesaco, Nariño", 1.38, -77.16), ("Planadas, Tolima", 3.20, -75.64), ("Chaparral, Tolima", 3.72, -75.48),
        ("Líbano, Tolima", 4.92, -75.06), ("Ibagué, Tolima", 4.44, -75.24), ("Viotá, Cundinamarca", 4.44, -74.52),
        ("La Vega, Cundinamarca", 4.99, -74.34), ("San Gil, Santander", 6.56, -73.13), ("Socorro, Santander", 6.47, -73.26),
        ("Salazar de las Palmas, Norte de Santander", 7.78, -72.81), ("Pueblo Bello, Cesar", 10.42, -73.59),
        ("Minca, Magdalena", 11.14, -74.12), ("Miraflores, Boyacá", 5.20, -73.15), ("Florencia, Caquetá", 1.61, -75.61),
    ],
    "africa_oriental": [
        ("Nyeri, Kenya", -0.42, 36.95), ("Ruiru, Kiambu, Kenya", -1.15, 36.96), ("Murang'a, Kenya", -0.72, 37.15),
        ("Kerugoya, Kirinyaga, Kenya", -0.50, 37.28), ("Embu, Kenya", -0.53, 37.45), ("Meru, Kenya", 0.05, 37.65),
        ("Kisii, Kenya", -0.68, 34.77), ("Bungoma, Kenya", 0.57, 34.56), ("Machakos, Kenya", -1.52, 37.26),
        ("Mbale, Uganda", 1.08, 34.18), ("Kapchorwa, Uganda", 1.40, 34.45), ("Masaka, Uganda", -0.33, 31.73),
        ("Mukono, Uganda", 0.35, 32.75), ("Kasese, Uganda", 0.18, 30.08), ("Fort Portal, Uganda", 0.66, 30.27),
        ("Bushenyi, Uganda", -0.54, 30.19), ("Luwero, Uganda", 0.84, 32.47), ("Moshi, Tanzania", -3.35, 37.34),
        ("Arusha, Tanzania", -3.37, 36.68), ("Mbeya, Tanzania", -8.90, 33.46), ("Mbinga, Tanzania", -10.93, 35.03),
        ("Bukoba, Tanzania", -1.33, 31.81), ("Huye, Rwanda", -2.60, 29.74), ("Ngozi, Burundi", -2.91, 29.83),
        ("Jimma, Ethiopia", 7.67, 36.83), ("Yirgacheffe, Ethiopia", 6.16, 38.20), ("Hawassa, Sidama, Ethiopia", 7.05, 38.48),
    ],
}

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data", "clima_puntos.json")


def main():
    out = json.load(open(OUT, encoding="utf-8")) if os.path.exists(OUT) else {}
    for region, points in REGIONS.items():
        done = {p["name"] for p in out.get(region, [])}
        out.setdefault(region, [])
        for name, lat, lon in points:
            if name in done:
                continue
            for attempt in range(4):
                try:
                    wc = weekly_climate(nasa_daily(lat, lon))
                    break
                except Exception as e:
                    print(f"  reintento {name}: {e}")
                    time.sleep(5 * (attempt + 1))
            else:
                print(f"FALLÓ {name}")
                continue
            out[region].append({"name": name, "lat": lat, "lon": lon,
                                "weekly_z": [[round(x, 2) for x in row] for row in wc["weekly_z"]],
                                "weekly_mean": [[round(x, 1) for x in row] for row in wc["weekly_mean"]],
                                "years": wc["years"]})
            json.dump(out, open(OUT, "w", encoding="utf-8"), ensure_ascii=False)
            print(f"{region}: {name} ok ({len(out[region])}/{len(points)})")
            time.sleep(1)
    print("listo:", OUT, {k: len(v) for k, v in out.items()})


if __name__ == "__main__":
    main()
