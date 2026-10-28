import bcrypt, { hash } from "bcrypt";

export const hashPassword=async(password)=>{
  return await bcrypt.hash(password,10);
}
export const isPasswordCorrect=async (hashedPassword,enteredPassword)=>{
  return await bcrypt.compare(enteredPassword,hashedPassword)
}