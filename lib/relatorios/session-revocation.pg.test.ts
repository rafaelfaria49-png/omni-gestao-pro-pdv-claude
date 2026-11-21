import { afterAll,describe,it,expect } from "vitest"
import { PrismaClient } from "@/generated/prisma"
import bcrypt from "bcryptjs"
import { prismaAdminSessionStore,resolveAdminSession } from "@/lib/auth/admin-session"

const url=process.env.REPORTS_QA_DATABASE_URL??"",password=process.env.REPORTS_QA_PASSWORD??""
if(url){const target=new URL(url);if(target.hostname!=="127.0.0.1"||target.pathname!=="/omni_reports_qa"||process.env.REPORTS_QA_DISPOSABLE!=="1"||!password)throw new Error("ISOLATED_SESSION_QA_REQUIRED")}
describe.skipIf(!url)("PR350 session revocation — real disposable PostgreSQL",()=>{
  const db=new PrismaClient({datasourceUrl:url||"postgresql://omni_qa@127.0.0.1:1/omni_reports_qa"})
  afterAll(()=>db.$disconnect())
  it("revokes A only, preserves B/another account and never increments sessionVersion",async()=>{
    const hash=await bcrypt.hash(password,4)
    const owner=await db.adminUser.create({data:{id:"qa-session-owner",email:"qa-session-owner@example.invalid",name:"Synthetic session owner",password:hash}})
    const other=await db.adminUser.create({data:{id:"qa-session-other",email:"qa-session-other@example.invalid",name:"Synthetic other account",password:hash}})
    const store=prismaAdminSessionStore(db)
    const create=(userId:string)=>resolveAdminSession(store,{sid:undefined,userId,isSignIn:true})
    const a=await create(owner.id),b=await create(owner.id),c=await create(other.id)
    if(!a.ok||!b.ok||!c.ok)throw new Error("SESSION_QA_CREATE_FAILED")
    await store.revoke(a.sid,"logout");await store.revoke(a.sid,"logout")
    expect((await resolveAdminSession(store,{sid:a.sid,userId:owner.id,isSignIn:false})).ok).toBe(false)
    expect((await resolveAdminSession(store,{sid:b.sid,userId:owner.id,isSignIn:false})).ok).toBe(true)
    expect((await resolveAdminSession(store,{sid:c.sid,userId:other.id,isSignIn:false})).ok).toBe(true)
    expect((await db.adminUser.findUniqueOrThrow({where:{id:owner.id}})).sessionVersion).toBe(owner.sessionVersion)
    expect(await db.adminSession.count({where:{userId:owner.id,revokedAt:{not:null}}})).toBe(1)
  })
  it("legacy adoption is deterministic and does not resurrect an already revoked row",async()=>{
    const legacy=await db.adminUser.create({data:{id:"qa-session-legacy",email:"qa-session-legacy@example.invalid",name:"Synthetic legacy account",password:await bcrypt.hash(password,4)}})
    const store=prismaAdminSessionStore(db),input={sid:undefined,jti:"synthetic-legacy-jti",userId:legacy.id,isSignIn:false}
    const adopted=await resolveAdminSession(store,input)
    if(!adopted.ok)throw new Error("SESSION_QA_ADOPTION_FAILED")
    await store.revoke(adopted.sid,"logout")
    expect(await resolveAdminSession(store,input)).toMatchObject({ok:false,reason:"revoked"})
  })
})
