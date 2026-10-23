import {afterEach,expect,test,vi} from 'vitest';
import {notificationFlashes} from './notification-flash.ts';
afterEach(()=>vi.useRealTimers());
test('new notices expand for five seconds; polling does not restart their timer',()=>{
 vi.useFakeTimers();const change=vi.fn(),queue=notificationFlashes(change);
 queue.sync(['a']);expect(change).toHaveBeenLastCalledWith(['a']);
 vi.advanceTimersByTime(4000);queue.sync(['a']);vi.advanceTimersByTime(999);expect(change).toHaveBeenLastCalledWith(['a']);
 vi.advanceTimersByTime(1);expect(change).toHaveBeenLastCalledWith([]);queue.dispose();
});
test('dismiss stays dismissed through polling; later notices get independent timers',()=>{
 vi.useFakeTimers();const change=vi.fn(),queue=notificationFlashes(change);
 queue.sync(['a']);queue.dismiss(['a']);queue.sync(['a']);expect(change).toHaveBeenLastCalledWith([]);
 vi.advanceTimersByTime(1000);queue.sync(['a','b']);expect(change).toHaveBeenLastCalledWith(['b']);vi.advanceTimersByTime(4000);expect(change).toHaveBeenLastCalledWith(['b']);
 vi.advanceTimersByTime(1000);expect(change).toHaveBeenLastCalledWith([]);queue.dispose();
});
test('resolved then recurring incidents can announce again; disposal cancels timers',()=>{
 vi.useFakeTimers();const change=vi.fn(),queue=notificationFlashes(change);
 queue.sync(['a']);queue.sync([]);queue.sync(['a']);expect(change).toHaveBeenLastCalledWith(['a']);queue.dispose();change.mockClear();vi.runAllTimers();expect(change).not.toHaveBeenCalled();
});
