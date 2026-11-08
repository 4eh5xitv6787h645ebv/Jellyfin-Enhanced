import type { Page, PublicPage } from '../features/downloads/types';
export interface DownloadsApi {
 getUrl(path:string,query?:Record<string,string|number>):string;getCurrentUserId():string;serverAddress?():string;accessToken?():string;serverId?:string|(()=>string);
 ajax(options:{type:string;url:string;dataType:string;headers:Record<string,string>}):Promise<unknown>;
}
export interface DownloadsHost {
 internals:{requestsPage?:Partial<Page>};downloadsPage:PublicPage;initializeDownloadsPage():void;
 pluginConfig?:{DownloadsPageEnabled?:boolean;DownloadsUseCustomTabs?:boolean;DownloadsUseNativeTab?:boolean;DownloadsUsePluginPages?:boolean;DownloadsPagePollingEnabled?:boolean;DownloadsPollIntervalSeconds?:number;DownloadsPageShowIssues?:boolean;DownloadsShowHistory?:boolean;ShowDownloadsInRequests?:boolean;JellyseerrEnabled?:boolean;ArrLinksEnabled?:boolean;JellyseerrUrl?:string;JellyseerrShowDetailPageLink?:boolean};
 session?:{checkNow?(reason:string):void;getEpoch():number;isCurrent(epoch:number):boolean;onUserChange(name:string,callback:()=>void):unknown};
 t(key:string):string;toast?(message:string,duration?:number):void;escapeHtml(value:string|number|null|undefined):string;
 jellyseerrAPI?:{resolveJellyseerrBaseUrl?():string};
 cdn:{selfhst(path:string):string};themer?:{getThemeVariables():{primaryAccent?:string}};
 hiddenContent?:{filterRequestItems<T>(items:T[]):T[]};
 helpers:{escHtml?(value:unknown):string;clearAvatarObjectUrlCache(force?:boolean):void;hydrateAvatarImages(container:Element):void;isAdmin():boolean;isActiveTabContainer(element:HTMLElement):boolean;onSidebarRebuilt(name:string,selector:string,callback:()=>void):unknown;onNavigate?(callback:()=>void):()=>void;observeTabContainers(name:string,selector:string,callback:()=>void):unknown};
 nativeTabs:{register(name:string,title:string,callback:(panel:HTMLElement)=>void,icon:string):void};
 jellyseerrIssueReporter?:{showReportModal(id:string,title:string,type:string,a:null,b:null):void};
 core:{api:{plugin(path:string,options?:{method?:string;skipRetry?:boolean;signal?:AbortSignal;priority?:string}):Promise<unknown>};ui:{isTvLayout():boolean;skeletonGridHtml(count:number):string;injectCss(id:string,css:string):void};lifecycle:{register(name:string):{track<T extends number|AbortController|(()=>void)>(resource:T):T;untrack(resource:number|AbortController|(()=>void)):void}}};
}
export interface DownloadsWindow extends Window {JellyfinEnhanced?:DownloadsHost;ApiClient?:DownloadsApi;Emby?:{Page?:{showItem(id:string):void}}}
export function downloadsHost() {
 const host:DownloadsWindow=window;
 const JE=host.JellyfinEnhanced;
 if(!JE) throw new Error('Downloads loaded before Jellyfin Enhanced');
 JE.internals ||= {};
 // The loader populates this one object in the declared eight-entry order.
 const P=JE.internals.requestsPage ||= {};
 return {JE,P:P as Page,host,getApi:()=>{if(!host.ApiClient)throw new Error('API client unavailable');return host.ApiClient;}};
}
