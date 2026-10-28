import dotenv from "dotenv";
import app from "./app.js";
import {connectDB} from "./database/index.js";

dotenv.config({
  path:"./.env"
})
console.log('hello');

connectDB()
.then(()=>{
  app.listen(process.env.PORT || 8000,()=>{
    console.log(`Server is running at Port : ${process.env.PORT}`)
  })
})
.catch((error)=>{
  console.log("DB CONNECTION FAILED!! ERROR:",error)
})
