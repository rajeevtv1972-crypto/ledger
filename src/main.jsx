import React from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

function App() {
  return React.createElement("main", { className: "page" },
    React.createElement("div", { className: "card" },
      React.createElement("div", { className: "logo" }, "L"),
      React.createElement("h1", null, "Ledger"),
      React.createElement("p", null, "Crypto portfolio tracking is coming online."),
      React.createElement("div", { className: "status" },
        React.createElement("span", { className: "dot" }),
        "Deployment ready"
      )
    )
  );
}

createRoot(document.getElementById("root")).render(React.createElement(App));
