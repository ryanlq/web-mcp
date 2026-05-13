import { createRoot } from "react-dom/client"
import App from "@/components/App"
import Options from "./Options"

document.documentElement.classList.add("dark")

const div = document.querySelector("#app")
const root = createRoot(div)
root.render(
  <App>
    <Options />
  </App>
)
