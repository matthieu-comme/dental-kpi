import { useState } from "react";
import DevisForm from "./DevisForm";
import ChequeForm from "./ChequeForm";

export default function PipContent({
  token,
  isSecretary,
  praticiens = [],
  initialPraticienId,
}) {
  const [tab, setTab] = useState("devis");
  const [selectedId, setSelectedId] = useState(initialPraticienId ?? null);

  return (
    <div className="pip-container">
      <div className="pip-header">
        <span className="pip-title">⚡ Saisie rapide</span>
      </div>

      {isSecretary && praticiens.length > 0 && (
        <div className="pip-praticien-bar">
          <label className="pip-praticien-label">Praticien</label>
          <select
            className="pip-praticien-select"
            value={selectedId ?? ""}
            onChange={(e) => setSelectedId(parseInt(e.target.value, 10))}
          >
            {praticiens.map((p) => (
              <option key={p.id_praticien} value={p.id_praticien}>
                {p.nom}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="pip-tabs">
        <button
          className={`pip-tab ${tab === "devis" ? "pip-tab--active" : ""}`}
          onClick={() => setTab("devis")}
        >
          Devis
        </button>
        <button
          className={`pip-tab ${tab === "cheque" ? "pip-tab--active" : ""}`}
          onClick={() => setTab("cheque")}
        >
          Chèque
        </button>
      </div>

      <div className="pip-body">
        {!selectedId ? (
          <p className="text-muted pip-empty">
            Sélectionnez un praticien pour commencer.
          </p>
        ) : tab === "devis" ? (
          <DevisForm token={token} idPraticien={selectedId} embedded />
        ) : (
          <ChequeForm token={token} idPraticien={selectedId} embedded />
        )}
      </div>
    </div>
  );
}
