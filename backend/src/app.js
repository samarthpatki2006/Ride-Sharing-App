import express from "express";
import cookieparser from "cookie-parser";
import cors from "cors";
import bodyParser from "body-parser";
const app=express();

app.use(cors({
  origin:process.env.CORS_ORIGIN,
  credentials:true
}))

app.use(express.json({"limit":"16kb"}))
app.use(express.urlencoded({"extended":true,"limit":"16kb"}))
app.use(express.static("public"))
app.use(cookieparser());
app.use(bodyParser.json());

import userRouter from "./routes/user.routes.js";
app.use("/api/v1/users",userRouter)


import ridesRouter from "./routes/rides.routes.js";
app.use("/api/v1/rides", ridesRouter);