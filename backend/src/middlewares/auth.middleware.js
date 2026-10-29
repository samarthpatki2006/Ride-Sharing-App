import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import jwt from "jsonwebtoken";
import { db } from "../database/index.js";

const verifyJWT=asyncHandler(async(req,_,next)=>{
  try {

    const token=req.cookies?.accessToken || req.header("Authorization")?.replace("Bearer ","")
    
    if(!token){
      throw new ApiError(401,"Unauthorized request")
    }
    
    const decodedToken=jwt.decode(token,process.env.ACCESS_TOKEN_SECRET)

    console.log(decodedToken)
    
    const [user]=await db.execute(`select id,name,phone,email from users where id=?;`,[decodedToken.userId])
  
    if(user.length==0){
      throw new ApiError(401,"Invalid Access Token")
    }
  
    req.user=user; // add new object to req
    next()
  }
  catch (error) {
    next(new ApiError(401,error?.message || "Invalid access token"));
  }
})

export {verifyJWT};