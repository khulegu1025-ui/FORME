import React from "react";
import { createRoot } from "react-dom/client";
import Shop from "../../app/commerce/FashionStore";
import "../../app/globals.css";

createRoot(document.getElementById("root")!).render(<Shop />);
