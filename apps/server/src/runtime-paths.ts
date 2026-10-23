import {homedir} from 'node:os';
import {isAbsolute,join,resolve} from 'node:path';
/** Same precedence as the isolated-tool recipes and newcomer bootstrap. */
export function resolveStudioDataRoot(env:NodeJS.ProcessEnv=process.env,home=homedir()):string{
 const configured=env.STUDIO_DATA_ROOT||join(env.XDG_DATA_HOME||join(home,'.local/share'),'music-video-studio');
 if(!isAbsolute(configured))throw new Error('STUDIO_DATA_ROOT / XDG_DATA_HOME must resolve to an absolute data directory');
 return resolve(configured);
}
