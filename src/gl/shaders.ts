/** 海上视认 WebGL2 着色器 (GLSL ES 3.00) */

export const SEA_VERT = /* glsl */ `#version 300 es
precision highp float;
out vec2 vUv;
void main(){
  // 单个大三角形覆盖屏幕
  vec2 p = vec2((gl_VertexID==2)?3.0:-1.0, (gl_VertexID==1)?3.0:-1.0);
  vUv = p*0.5+0.5;
  gl_Position = vec4(p,0.0,1.0);
}`;

export const SEA_FRAG = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;

uniform vec2  uRes;
uniform float uTime;
uniform float uHaze;         // 0..1 雾/霾浓度
uniform float uReflect;      // 0..1 海面反光
uniform float uBeam;         // 0..1 当前灯质闪光
uniform float uTransmission; // 路径大气透射比 T^R (Allard/Koschmieder)
uniform float uIntensity;    // 光强归一化增益
uniform float uSweep;        // 光束扫描角(弧度)
uniform vec3  uLightColor;
uniform vec3  uSectorColor;  // 当前方位扇区颜色
uniform float uBlocked;      // 遮挡 0..1

float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
float noise(vec2 p){
  vec2 i=floor(p), f=fract(p);
  float a=hash(i), b=hash(i+vec2(1,0)), c=hash(i+vec2(0,1)), d=hash(i+vec2(1,1));
  vec2 u=f*f*(3.0-2.0*f);
  return mix(mix(a,b,u.x), mix(c,d,u.x), u.y);
}

void main(){
  vec2 uv = vUv;
  float aspect = uRes.x/uRes.y;
  vec2 p = uv; p.x *= aspect;

  float horizon = 0.47;
  vec3 fogCol = vec3(0.62,0.70,0.78);

  // ---- 天空 ----
  vec3 skyTop = vec3(0.012,0.035,0.075);
  vec3 skyMid = vec3(0.05,0.12,0.20);
  vec3 skyHor = vec3(0.16,0.27,0.38);
  float sy = clamp(uv.y,0.0,1.0);
  vec3 sky = mix(skyHor, skyMid, smoothstep(horizon, 0.72, sy));
  sky = mix(sky, skyTop, smoothstep(0.62, 1.0, sy));

  // 星星
  if(uv.y>horizon){
    vec2 g = floor(uv*vec2(220.0,140.0));
    float st = hash(g);
    float tw = 0.5+0.5*sin(uTime*2.0+st*40.0);
    float star = step(0.9975, st)*tw*smoothstep(horizon+0.04,0.7,uv.y);
    sky += vec3(star)*(1.0-uHaze)*0.9;
  }
  // 月光/微光
  float moonD = length((uv-vec2(0.2,0.82))*vec2(aspect,1.0));
  sky += vec3(0.5,0.62,0.8)*smoothstep(0.12,0.0,moonD)*0.5*(1.0-uHaze);

  // 灯塔位置(海平线上, 偏右)
  vec2 L = vec2(0.70*aspect, horizon+0.015);

  // ---- 旋转光束(天空中的体积光锥) ----
  vec2 rel = p - L;
  float ang = atan(rel.y, rel.x);
  // 光束主方向大致水平, 叠加缓慢扫描
  float beamAng = 0.02 + 0.10*sin(uSweep);
  float da = atan(sin(ang-beamAng), cos(ang-beamAng));
  float cone = smoothstep(0.05, 0.0, abs(da)) * smoothstep(1.4,0.15,length(rel));
  float beamVol = cone * uBeam * uTransmission * uIntensity;
  sky += uLightColor * beamVol * 0.35;

  vec3 col = sky;

  // ---- 海面 ----
  if(uv.y < horizon){
    float depth = (horizon-uv.y);
    vec2 q = vec2(uv.x*aspect*60.0, uv.y*220.0);
    float w1 = sin(q.y*0.9 + uTime*1.6 + sin(q.x*0.5))*0.5+0.5;
    float w2 = noise(q*0.25 + vec2(uTime*0.25, -uTime*0.7));
    float wave = w1*0.5 + w2*0.8;
    vec3 seaDeep = vec3(0.012,0.05,0.09);
    vec3 seaHor  = vec3(0.10,0.22,0.32);
    vec3 sea = mix(seaDeep, seaHor, smoothstep(0.0,0.5,depth));
    sea += vec3(0.05,0.09,0.12)*wave*0.25;

    // 灯塔倒影光路
    float lx = L.x/aspect;
    float dx = (uv.x - lx);
    float streakW = 0.012 + depth*0.10;
    float streak = exp(-(dx*dx)/(streakW*streakW));
    float shimmer = 0.55+0.45*sin(uv.y*260.0 + uTime*3.2 + sin(uv.x*90.0+uTime)*2.0);
    shimmer *= 0.6+0.4*noise(vec2(uv.x*120.0, uTime*1.5));
    float pathFade = smoothstep(0.5,0.0,depth);
    float refl = streak*shimmer*pathFade*uReflect*uBeam*uTransmission*uIntensity;
    vec3 reflCol = mix(uLightColor, uSectorColor, 0.35);
    sea += reflCol * refl * 1.5;
    // 环境海面微光反射
    sea += vec3(0.10,0.16,0.22)*uReflect*wave*0.10;
    col = sea;
  }

  // 海平线辉光
  float lineGlow = exp(-abs(uv.y-horizon)*60.0);
  col += vec3(0.35,0.55,0.75)*lineGlow*0.5;

  // ---- 灯塔剪影 + 灯室 ----
  // 塔身(梯形)
  float tx = (uv.x - L.x/aspect);
  float towerBase = horizon-0.02;
  float ty = uv.y - towerBase;
  float towerH = 0.16;
  if(ty>0.0 && ty<towerH){
    float halfW = mix(0.020, 0.010, ty/towerH);
    if(abs(tx) < halfW){
      float stripes = step(0.5, fract(ty*22.0));
      vec3 towerCol = mix(vec3(0.85), vec3(0.65,0.12,0.12), stripes);
      // 简单明暗
      towerCol *= 0.55 + 0.35*smoothstep(-halfW,halfW,tx);
      col = towerCol;
    }
  }
  // 灯室光点 + 光晕
  vec2 lampUV = vec2(L.x/aspect, L.y+0.155);
  float ld = length((uv-lampUV)*vec2(aspect,1.0));
  float lampCore = smoothstep(0.014,0.0,ld);
  float halo = exp(-ld*7.0);
  float wide = exp(-ld*2.6)*0.5;
  float visible = uBeam*uTransmission*(1.0-uBlocked*0.92)*uIntensity;
  col += uLightColor*(lampCore*2.6 + halo*1.3 + wide) * clamp(visible+0.12,0.0,2.2);
  // 近距常亮灯室轮廓
  col += vec3(1.0,0.9,0.6)*smoothstep(0.02,0.0,ld)*0.25;

  // ---- 雾/能见度 (天气霾为主; 路径透射只轻微贡献海平线灰化) ----
  float distHaze = (1.0-uTransmission)*0.16 * smoothstep(0.9, 0.2, uv.y);
  float fog = clamp(uHaze*0.85 + distHaze, 0.0, 0.92);
  col = mix(col, fogCol, fog);

  // 暗角
  float vig = smoothstep(1.25,0.35, length((uv-0.5)*vec2(aspect,1.0)));
  col *= mix(0.72,1.0,vig);

  // 轻微色调
  col = pow(col, vec3(0.92));
  outColor = vec4(col,1.0);
}`;
