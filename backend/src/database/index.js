import mysql from "mysql2/promise";

let db;
const connectDB=async ()=>{
  try{
    db=await mysql.createPool({
      host:process.env.HOST,
      user:process.env.DB_USER,
      database:process.env.DB_NAME,
      password:process.env.DB_PASSWORD,
      connectionLimit:process.env.CONNECTION_LIMIT
    })
    console.log("Connected to MYSQL DB");
  }
  catch(error){
    console.log("DB CONNECTION FAILED!! ERROR:", error)
  }
}
export {db,connectDB}