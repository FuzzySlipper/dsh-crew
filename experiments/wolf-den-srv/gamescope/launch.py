"""Disposable Wolf lobby variant. Run on den-srv; never changes Wolf config."""
import http.client, socket, json, sys, pathlib
lease_id = sys.argv[1]
class UnixHTTP(http.client.HTTPConnection):
    def connect(self):
        self.sock=socket.socket(socket.AF_UNIX,socket.SOCK_STREAM)
        self.sock.settimeout(35)
        self.sock.connect('/data/services/playtest-wolf/wolf.sock')
def call(route,data=None):
    c=UnixHTTP('localhost');body=None if data is None else json.dumps(data)
    c.request('GET' if data is None else 'POST','/api/v1/'+route,body,{'Content-Type':'application/json'})
    r=c.getresponse();x=json.loads(r.read());c.close()
    if r.status!=200 or not x.get('success'):raise RuntimeError(route+': '+str(x.get('error',r.status)))
    return x
client='7411603768457197485'
session=next(s for s in call('sessions')['sessions'] if str(s['client_id'])==client)
app=next(a for p in call('profiles')['profiles'] if p['id']=='user' for a in p['apps'] if a['title']=='Firefox')
runner=app['runner'];runner['name']='WolfFirefoxGamescope'
runner['env']=[s for s in runner.get('env',[]) if not s.startswith(('RUN_SWAY=','RUN_GAMESCOPE=','MOZ_ENABLE_WAYLAND='))]+['RUN_GAMESCOPE=1','MOZ_ENABLE_WAYLAND=0']
name='Gamescope pointer probe '+lease_id
request={'profile_id':'user','name':name,'icon_png_path':app['icon_png_path'],'multi_user':False,'stop_when_everyone_leaves':False,'runner_state_folder':'playtest/gamescope/WolfFirefox','runner':runner,'video_settings':{'width':session['video_width'],'height':session['video_height'],'refresh_rate':session['video_refresh_rate'],'runner_render_node':app['render_node'],'wayland_render_node':app['render_node'],'video_producer_buffer_caps':'video/x-raw(memory:DMABuf), drm-format={NV12,YV12,YU12,P012,YUYV,YU24,AB24,AR24,XB24,XR24}'},'audio_settings':{'channel_count':session['audio_channel_count']},'client_settings':session['client_settings']}
try:
    result=call('lobbies/create',request);lid=result['lobby_id']
    pathlib.Path('/tmp/gamescope-probe-lobby.json').write_text(json.dumps({'lobby_id':lid,'lease_id':lease_id,'name':name}))
    call('lobbies/join',{'lobby_id':lid,'moonlight_session_id':client})
    print(json.dumps({'lobby_id':lid,'runner_name':runner['name'],'env':runner['env']}))
except Exception:
    for lobby in call('lobbies')['lobbies']:
        if lobby.get('name')==name:call('lobbies/stop',{'lobby_id':lobby['id']})
    raise
