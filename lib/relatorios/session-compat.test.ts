import { afterEach,beforeEach,describe,it,expect,vi } from "vitest"
import type { JWT } from "next-auth/jwt"
import { legacyAdminSessionId } from "../auth/admin-session"
type Captured={callbacks:{jwt(args:{token:JWT;user?:unknown}):Promise<JWT|null>};events:{signOut(args:{token:JWT|null}):Promise<void>}}
const h=vi.hoisted(()=>({config:null as unknown,db:{
  adminUser:{findUnique:vi.fn(),updateMany:vi.fn()},store:{findMany:vi.fn()},
  adminSession:{create:vi.fn(),createMany:vi.fn(),findUnique:vi.fn(),updateMany:vi.fn(),deleteMany:vi.fn()},
}}))
vi.mock("@/lib/prisma",()=>({prisma:h.db}))
vi.mock("next-auth",()=>({default:(config:unknown)=>{h.config=config;return {handlers:{},signIn:vi.fn(),signOut:vi.fn(),auth:vi.fn()}}}))
import "../../auth"
describe("report compatibility with PR350 auth configuration",()=>{
  beforeEach(()=>{
    vi.clearAllMocks()
    h.db.adminUser.findUnique.mockResolvedValue({id:"qa-unit-user",name:"Synthetic",email:"unit@example.invalid",active:true,sessionVersion:0,role:"GERENTE",accessScope:"STORE",lojaId:"qa-store",adminUserStores:[]})
    h.db.store.findMany.mockResolvedValue([])
    h.db.adminSession.updateMany.mockResolvedValue({count:1})
  })
  afterEach(()=>vi.unstubAllEnvs())
  it("flag off performs no new session queries or global version writes",async()=>{
    vi.stubEnv("AUTH_SESSION_REVOCATION","off")
    const config=h.config as Captured
    expect(await config.callbacks.jwt({token:{sub:"qa-unit-user",sessionVersion:0}})).not.toBeNull()
    await config.events.signOut({token:{sub:"qa-unit-user",sid:"a".repeat(43),sessionVersion:0}})
    for(const method of Object.values(h.db.adminSession))expect(method).not.toHaveBeenCalled()
    expect(h.db.adminUser.updateMany).not.toHaveBeenCalled()
  })
  it("flag on revokes precisely the signed sid without touching account sessionVersion",async()=>{
    vi.stubEnv("AUTH_SESSION_REVOCATION","on")
    const sid="b".repeat(43)
    await (h.config as Captured).events.signOut({token:{sub:"qa-unit-user",sid,sessionVersion:0}})
    expect(h.db.adminSession.updateMany).toHaveBeenCalledWith({where:{id:sid,revokedAt:null},data:{revokedAt:expect.any(Date),revokedReason:"logout"}})
    expect(h.db.adminUser.updateMany).not.toHaveBeenCalled()
  })
  it("revoga o mesmo sid derivado para o cookie legado que a leitura mantém intacto", async () => {
    vi.stubEnv("AUTH_SESSION_REVOCATION", "on")
    const userId = "qa-unit-user"
    const jti = "qa-signed-legacy-jti"
    const sid = legacyAdminSessionId(jti)
    h.db.adminSession.findUnique.mockResolvedValue({userId,revokedAt:null,expiresAt:new Date(Date.now() + 30 * 86400_000)})
    await (h.config as Captured).events.signOut({token:{sub:userId,jti,sessionVersion:0}})
    expect(h.db.adminSession.createMany).toHaveBeenCalledWith({data:[{id:sid,userId,expiresAt:expect.any(Date)}],skipDuplicates:true})
    expect(h.db.adminSession.updateMany).toHaveBeenCalledWith({where:{id:sid,revokedAt:null},data:{revokedAt:expect.any(Date),revokedReason:"logout"}})
  })
})
