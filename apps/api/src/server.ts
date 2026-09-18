import "dotenv/config";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local", override: true });

const { app } = await import("./app.js");
const port = Number(process.env.PORT ?? 3000);
app.listen(port, () => console.log(`CreativeFlow API listening on ${port}`));
