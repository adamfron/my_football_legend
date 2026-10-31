"""Development scatter/covariance diagnostics; ellipses have no confidence interpretation."""
import gzip
import hashlib
import json
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import Ellipse
import numpy as np

ROOT = Path("docs/performance/pr207")
raw = json.loads(gzip.decompress((ROOT / "lab-development-v1.json.gz").read_bytes()))
fig, axes = plt.subplots(2, 2, figsize=(12, 9), constrained_layout=True)
colors = {"baseline": "#858b94", "contact-v1": "#147d92"}
for row_index, family in enumerate(("pass", "shot")):
    for column, skill in enumerate((25, 90)):
        ax = axes[row_index, column]
        selected = [r for r in raw["result"]["rows"]
                    if r["config"]["family"] == family
                    and r["config"]["metres"] == (10 if family == "pass" else 20)
                    and r["config"]["primary"] == skill
                    and r["config"]["technique"] == skill
                    and r["config"]["context"] == "open"
                    and r["config"]["delivery"] == "ground"
                    and r["config"]["intent"] == "placed"]
        for arm_index, model in enumerate(("baseline", "contact-v1")):
            points = []
            for r in selected:
                a = r["arms"][arm_index]
                if not a["released"]:
                    continue
                if family == "pass":
                    points.append([a["flight"]["stop"]["y"] - r["nominal"]["stop"]["y"],
                                   a["flight"]["stop"]["x"] - r["nominal"]["stop"]["x"]])
                elif a["flight"]["plane"]:
                    points.append([a["flight"]["plane"]["y"] - a["target"]["y"],
                                   a["flight"]["plane"]["z"] - 0.8 * 2.44])
            points = np.array(points)
            ax.scatter(points[:, 0], points[:, 1], s=18, alpha=0.6,
                       color=colors[model], label=f"{model}, n={len(points)}")
            covariance = np.cov(points.T, bias=True)
            eigenvalues, eigenvectors = np.linalg.eigh(covariance)
            order = eigenvalues.argsort()[::-1]
            eigenvalues, eigenvectors = eigenvalues[order], eigenvectors[:, order]
            angle = np.degrees(np.arctan2(eigenvectors[1, 0], eigenvectors[0, 0]))
            centre = points.mean(axis=0)
            ax.add_patch(Ellipse(centre, 2 * np.sqrt(max(0, eigenvalues[0])),
                                2 * np.sqrt(max(0, eigenvalues[1])), angle=angle,
                                fill=False, lw=2, color=colors[model]))
        ax.axhline(0, color="#222", lw=0.6)
        ax.axvline(0, color="#222", lw=0.6)
        ax.grid(alpha=0.18)
        ax.set_title(f"{'10 m ground pass' if family == 'pass' else '20 m placed shot'} | skills {skill}/{skill}")
        ax.set_xlabel("Lateral error (m)")
        ax.set_ylabel("Stopping distance error vs nominal (m)" if family == "pass" else "Goal-plane height error vs aim (m)")
        ax.legend(fontsize=8)
fig.suptitle("PR207: independent kick samples and unit covariance ellipses\nDiagnostic only; not calibrated confidence regions", fontsize=14)
output = ROOT / "error-ellipses.png"
fig.savefig(output, dpi=160)
plt.close(fig)
metadata = {"inputSha256": hashlib.sha256((ROOT / "lab-development-v1.json.gz").read_bytes()).hexdigest(),
            "methodSha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
            "imageSha256": hashlib.sha256(output.read_bytes()).hexdigest(),
            "confidenceRegion": False}
(ROOT / "error-ellipses-metadata.json").write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")
