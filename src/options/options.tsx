import React from "react";
import { createRoot } from "react-dom/client";

function OptionsApp() {
  return (
    <div style={{ padding: 16 }}>
      <h1>Extension Options</h1>
      <p>Configure API keys and preferences here.</p>
    </div>
  );
}

const container = document.getElementById("root")!;
createRoot(container).render(<OptionsApp />);
