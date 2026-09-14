/**
 * Market universe + contract universe for the Deriv Liquidity Intelligence platform.
 * Read-only public market data. No authentication, no trading, no DBot logic.
 */
export const WS_PRIMARY="wss://ws.derivws.com/websockets/v3?app_id=1089";
export const WS_LEGACY="wss://ws.binaryws.com/websockets/v3?app_id=1089";
export type MarketGroup="STANDARD"|"1S"|"JUMP";
export interface MarketDef{symbol:string;name:string;group:MarketGroup}
export const UNIVERSE:MarketDef[]=[{symbol:"R_10",name:"Volatility 10",group:"STANDARD"},{symbol:"R_25",name:"Volatility 25",group:"STANDARD"},{symbol:"R_50",name:"Volatility 50",group:"STANDARD"},{symbol:"R_75",name:"Volatility 75",group:"STANDARD"},{symbol:"R_100",name:"Volatility 100",group:"STANDARD"},{symbol:"1HZ10V",name:"Volatility 10 (1s)",group:"1S"},{symbol:"1HZ25V",name:"Volatility 25 (1s)",group:"1S"},{symbol:"1HZ50V",name:"Volatility 50 (1s)",group:"1S"},{symbol:"1HZ75V",name:"Volatility 75 (1s)",group:"1S"},{symbol:"1HZ100V",name:"Volatility 100 (1s)",group:"1S"},{symbol:"JD10",name:"Jump 10",group:"JUMP"},{symbol:"JD25",name:"Jump 25",group:"JUMP"},{symbol:"JD50",name:"Jump 50",group:"JUMP"},{symbol:"JD75",name:"Jump 75",group:"JUMP"},{symbol:"JD100",name:"Jump 100",group:"JUMP"}];
export const MARKET_GROUPS:MarketGroup[]=["STANDARD","1S","JUMP"];
export const WINDOWS=[10,20,50,100,200,500,1000] as const;
export const HISTORY_CAP=1000;
export type ContractKind="OVER"|"UNDER";
export interface ContractDef{id:string;label:string;kind:ContractKind;barrier:number}
export const CONTRACTS:ContractDef[]=[...Array.from({length:4},(_,i)=>({id:`OVER${i+1}`,label:`OVER ${i+1}`,kind:"OVER" as const,barrier:i+1})),...Array.from({length:4},(_,i)=>({id:`UNDER${8-i}`,label:`UNDER ${8-i}`,kind:"UNDER" as const,barrier:8-i}))];
export const LIQUIDITY_STATES=["ABSENT","FORMING","BUILDING","MATURE","ABSORBING","EXHAUSTING","RIPE","RELEASED","CONFIRMED","CONFLICTED","BLOCKED"] as const;
export type LiquidityState=(typeof LIQUIDITY_STATES)[number];
export const LIQUIDITY_LAWS=["NO LIQUIDITY WITHOUT OBSERVED CREATION","NO RIPE STATUS WITHOUT MATURATION","NO RELEASE WITHOUT OBSERVED STRUCTURAL CHANGE","NO CONFIRMATION WITHOUT MULTI-DIMENSIONAL SUPPORT","RIPE IS NOT CONFIRMED","CONFLICTED STRUCTURES ARE NEVER FORCED INTO A DIRECTION","NO CLAIM OF HIDDEN ORDER FLOW OR TRADER MANIPULATION"];
export const ANALYSIS_VERSION="v4-authoritative";
