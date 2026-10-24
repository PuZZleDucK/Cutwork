export interface TaskContextPreview {
 id:'music'|'video-text'|'video-image';title:string;text:string;sha256:string;
 sources:{name:string;sourcePath:string;sha256:string}[];
 /** Non-null means the displayed context is incomplete; no placeholder guide is invented. */
 error:string|null;
}
export interface TaskContextPreviews {contexts:TaskContextPreview[]}
