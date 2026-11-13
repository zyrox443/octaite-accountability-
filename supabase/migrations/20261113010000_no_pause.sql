-- Update 4: tasks can no longer be paused. Once started, a task runs until
-- it is completed. This removes the members' ability to call pause_task.
-- Safe to run more than once.
revoke execute on function public.pause_task(uuid) from authenticated, anon, public;
