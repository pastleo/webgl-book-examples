import * as twgl from '../../lib/vendor/twgl-full.module.js';
import * as WebGLObjLoader from '../../lib/vendor/webgl-obj-loader.esm.js';
import listenToInputs, { update as inputUpdate } from '../../lib/input.js';
import { degToRad } from '../../lib/utils.js';
import { matrix4 } from '../../lib/matrix.js';

const vertexShaderSource = `#version 300 es
in vec4 a_position;
in vec2 a_texcoord;
in vec3 a_normal;

uniform mat4 u_matrix;
uniform mat4 u_worldMatrix;
uniform mat4 u_normalMatrix;
uniform vec3 u_worldViewerPosition;
uniform mat4 u_reflectionMatrix;
uniform mat4 u_lightProjectionMatrix;

out vec2 v_texcoord;
out vec3 v_surfaceToViewer;
out mat3 v_normalMatrix;
out vec4 v_reflectionTexcoord;
out float v_depth;
out vec4 v_lightProjection;
out vec4 v_worldPosition;

void main() {
  gl_Position = u_matrix * a_position;
  v_texcoord = vec2(a_texcoord.x, 1.0 - a_texcoord.y);

  vec3 normal = mat3(u_normalMatrix) * a_normal;
  vec3 normalMatrixI = normal.y >= 1.0 ?
    vec3(1, 0, 0) :
    normalize(cross(vec3(0, 1, 0), normal));
  vec3 normalMatrixJ = normalize(cross(normal, normalMatrixI));

  v_normalMatrix = mat3(
    normalMatrixI,
    normalMatrixJ,
    normal
  );

  v_worldPosition = u_worldMatrix * a_position;
  v_surfaceToViewer = u_worldViewerPosition - v_worldPosition.xyz;

  v_reflectionTexcoord = u_reflectionMatrix * v_worldPosition;

  v_depth = gl_Position.z / gl_Position.w * 0.5 + 0.5;
  v_lightProjection = u_lightProjectionMatrix * v_worldPosition;
}
`;

const fragmentShaderSource = `#version 300 es
precision highp float;

in vec2 v_texcoord;
in vec3 v_surfaceToViewer;
in vec3 v_surfaceToLight;
in mat3 v_normalMatrix;
in vec4 v_lightProjection;

uniform sampler2D u_normalMap;
uniform vec3 u_diffuse;
uniform sampler2D u_diffuseMap;
uniform vec3 u_lightDir;
uniform vec3 u_specular;
uniform float u_specularExponent;
uniform vec3 u_emissive;
uniform vec3 u_ambient;
uniform sampler2D u_lightProjectionMap;

out vec4 outColor;

void main() {
  vec3 normal = texture(u_normalMap, v_texcoord).xyz * 2.0 - 1.0;
  normal = normalize(v_normalMatrix * normal);

  vec2 lightProjectionCoord = v_lightProjection.xy / v_lightProjection.w * 0.5 + 0.5;
  float lightToSurfaceDepth = v_lightProjection.z / v_lightProjection.w * 0.5 + 0.5;
  float lightProjectedDepth = texture(
    u_lightProjectionMap,
    lightProjectionCoord
  ).r;

  vec3 diffuse = u_diffuse + texture(u_diffuseMap, v_texcoord).rgb;

  vec3 surfaceToLightDir = normalize(-u_lightDir);

  float diffuseLight = clamp(dot(surfaceToLightDir, normal), 0.0, 1.0);

  vec3 surfaceToViewerDirection = normalize(v_surfaceToViewer);

  vec3 halfVector = normalize(surfaceToLightDir + surfaceToViewerDirection);
  float specularBrightness = pow(
    clamp(dot(halfVector, normal), 0.0, 1.0), u_specularExponent
  );

  float occlusion = smoothstep(0.01, 0.1, lightToSurfaceDepth - lightProjectedDepth);

  diffuseLight *= 1.0 - occlusion;
  specularBrightness *= 1.0 - clamp(occlusion * 2.0, 0.0, 1.0);

  vec3 ambient = u_ambient * diffuse;

  outColor = vec4(
    clamp(
      diffuse * diffuseLight +
      u_specular * specularBrightness +
      u_emissive,
      ambient, vec3(1, 1, 1)
    ),
    1
  );
}
`;

const depthFragmentShaderSource = `#version 300 es
precision highp float;

in float v_depth;

out vec4 outColor;

void main() {
  outColor = vec4(v_depth, v_depth, v_depth, 1);
}
`;

const oceanFragmentShaderSource = `#version 300 es
precision highp float;

in vec2 v_texcoord;
in vec3 v_surfaceToViewer;
in vec3 v_surfaceToLight;
in mat3 v_normalMatrix;
in vec4 v_reflectionTexcoord;
in vec4 v_lightProjection;
in vec4 v_worldPosition;

uniform sampler2D u_normalMap;
uniform vec3 u_diffuse;
uniform sampler2D u_diffuseMap;
uniform vec3 u_lightDir;
uniform vec3 u_specular;
uniform float u_specularExponent;
uniform vec3 u_emissive;
uniform vec3 u_ambient;
uniform sampler2D u_lightProjectionMap;
uniform vec2 u_normalMapSize;

out vec4 outColor;

void main() {
  vec2 texcoord = (v_reflectionTexcoord.xy / v_reflectionTexcoord.w) * 0.5 + 0.5;
  vec3 normal = texture(u_normalMap, v_worldPosition.xz / u_normalMapSize).xyz * 2.0 - 1.0;
  vec2 distortion = normalize(normal).xy;
  normal = normalize(v_normalMatrix * normal);

  vec2 lightProjectionCoord = v_lightProjection.xy / v_lightProjection.w * 0.5 + 0.5;
  float lightToSurfaceDepth = v_lightProjection.z / v_lightProjection.w * 0.5 + 0.5;
  float lightProjectedDepth = texture(
    u_lightProjectionMap,
    lightProjectionCoord + distortion * 0.01
  ).r;

  vec3 diffuse = u_diffuse + texture(
    u_diffuseMap,
    texcoord + distortion * 0.1
  ).rgb;

  vec3 surfaceToLightDir = normalize(-u_lightDir);

  float diffuseLight = clamp(dot(surfaceToLightDir, normal), 0.0, 1.0);

  vec3 surfaceToViewerDirection = normalize(v_surfaceToViewer);

  vec3 halfVector = normalize(surfaceToLightDir + surfaceToViewerDirection);
  float specularBrightness = pow(
    clamp(dot(halfVector, normal), 0.0, 1.0), u_specularExponent
  );

  float occlusion = smoothstep(0.01, 0.1, lightToSurfaceDepth - lightProjectedDepth);

  diffuseLight *= 1.0 - occlusion;
  specularBrightness *= 1.0 - clamp(occlusion * 2.0, 0.0, 1.0);

  vec3 ambient = u_ambient * diffuse;

  outColor = vec4(
    clamp(
      diffuse * diffuseLight +
      u_specular * specularBrightness +
      u_emissive,
      ambient, vec3(1, 1, 1)
    ),
    1
  );
}
`;

const skyboxVertexShaderSource = `#version 300 es
in vec2 a_position;
uniform mat4 u_matrix;

out vec3 v_normal;

void main() {
  gl_Position = vec4(a_position, 1, 1);
  v_normal = (u_matrix * gl_Position).xyz;
}
`;
const skyboxFragmentShaderSource = `#version 300 es
precision highp float;

in vec3 v_normal;

out vec4 outColor;

uniform samplerCube u_skyboxMap;

void main() {
  outColor = texture(u_skyboxMap, normalize(v_normal));
}
`;

async function setup() {
  const canvas = document.getElementById('canvas');
  const gl = canvas.getContext('webgl2');

  twgl.setAttributePrefix('a_');

  const programInfo = twgl.createProgramInfo(gl, [vertexShaderSource, fragmentShaderSource]);
  const depthProgramInfo = twgl.createProgramInfo(gl, [vertexShaderSource, depthFragmentShaderSource]);
  const oceanProgramInfo = twgl.createProgramInfo(gl, [vertexShaderSource, oceanFragmentShaderSource]);
  const skyboxProgramInfo = twgl.createProgramInfo(gl, [skyboxVertexShaderSource, skyboxFragmentShaderSource]);

  const textures = twgl.createTextures(gl, {
    scale: {
      src: '/assets/scale_diffuse.webp',
      min: gl.LINEAR_MIPMAP_LINEAR, mag: gl.LINEAR,
    },
    scaleNormal: {
      src: '/assets/scale_normal.webp',
      min: gl.LINEAR_MIPMAP_LINEAR, mag: gl.LINEAR,
    },
    oceanNormal: {
      src: '/assets/water_normal.webp',
      min: gl.LINEAR_MIPMAP_LINEAR, mag: gl.LINEAR,
      wrap: gl.REPEAT,
    },
    skybox: {
      target: gl.TEXTURE_CUBE_MAP,
      src: [
        '/assets/skybox/east.webp',
        '/assets/skybox/west.webp',
        '/assets/skybox/up.webp',
        '/assets/skybox/down.webp',
        '/assets/skybox/north.webp',
        '/assets/skybox/south.webp',
      ],
    },
    null: { src: [0, 0, 0, 255] },
    nullNormal: { src: [127, 127, 255, 255] },
  });

  textures.text = createTextTexture(gl);

  const framebuffers = {};

  framebuffers.reflection = twgl.createFramebufferInfo(
    gl,
    null, // attachments
    2048, // width
    2048, // height
  );
  textures.reflection = framebuffers.reflection.attachments[0];

  framebuffers.lightProjection = twgl.createFramebufferInfo(gl, [{
    attachmentPoint: gl.DEPTH_ATTACHMENT,
    internalFormat: gl.DEPTH_COMPONENT32F,
    minMag: gl.NEAREST,
  }], 2048, 2048);
  textures.lightProjection = framebuffers.lightProjection.attachments[0];

  const objects = {};

  { // sphere
    const vertexDataArrays = twgl.primitives.createSphereVertices(1, 32, 32);
    const bufferInfo = twgl.createBufferInfoFromArrays(gl, vertexDataArrays);
    const vao = twgl.createVAOFromBufferInfo(gl, programInfo, bufferInfo);

    objects.sphere = {
      vertexDataArrays,
      vao, bufferInfo,
    };
  }

  { // plane
    const vertexDataArrays = twgl.primitives.createPlaneVertices();
    const bufferInfo = twgl.createBufferInfoFromArrays(gl, vertexDataArrays);
    const vao = twgl.createVAOFromBufferInfo(gl, programInfo, bufferInfo);

    objects.plane = {
      vertexDataArrays,
      vao, bufferInfo,
    };
  }

  { // skybox
    const attribs = twgl.primitives.createXYQuadVertices()
    const bufferInfo = twgl.createBufferInfoFromArrays(gl, attribs);
    const vao = twgl.createVAOFromBufferInfo(gl, skyboxProgramInfo, bufferInfo);

    objects.skybox = {
      attribs,
      bufferInfo,
      vao,
    };
  }

  objects.sailboat = await loadSailboatModel(gl, textures, programInfo);

  gl.enable(gl.CULL_FACE);
  gl.enable(gl.DEPTH_TEST);
  gl.clearColor(0, 0, 0, 1);

  return {
    gl,
    programInfo, depthProgramInfo,
    oceanProgramInfo, skyboxProgramInfo,
    textures, framebuffers, objects,
    state: {
      fieldOfView: degToRad(45),
      cameraRotationXY: [degToRad(-45), 0],
      cameraDistance: 15,
      cameraViewing: [0, 0, 0],
      lightRotationXY: [0, 0],
      resolutionRatio: 1,
    },
    time: 0,
  };
}

async function loadSailboatModel(gl, textures, programInfo) {
  const { boatModel } = await WebGLObjLoader.downloadModels([{
    name: 'boatModel',
    obj: '/assets/sailboat.obj',
    mtl: true,
  }]);

  const sharedBufferInfo = twgl.createBufferInfoFromArrays(gl, {
    position: { numComponents: 3, data: boatModel.vertices },
    texcoord: { numComponents: 2, data: boatModel.textures },
    normal: { numComponents: 3, data: boatModel.vertexNormals },
  });

  const parts = boatModel.indicesPerMaterial.map((indices, mtlIdx) => {
    const material = boatModel.materialsByIndex[mtlIdx];

    const bufferInfo = twgl.createBufferInfoFromArrays(gl, {
      indices,
    }, sharedBufferInfo);

    let u_diffuseMap = textures.null;
    if (material.mapDiffuse.texture) {
      u_diffuseMap = twgl.createTexture(gl, {
        wrapS: gl.CLAMP_TO_EDGE, wrapT: gl.CLAMP_TO_EDGE,
        min: gl.LINEAR_MIPMAP_LINEAR,
        src: material.mapDiffuse.texture,
      });
    }

    return {
      bufferInfo,
      vao: twgl.createVAOFromBufferInfo(gl, programInfo, bufferInfo),
      uniforms: {
        u_diffuse: material.diffuse,
        u_diffuseMap,
        u_specular: material.specular,
        u_specularExponent: material.specularExponent,
        u_emissive: material.emissive,
        u_ambient: [0.6, 0.6, 0.6],
      },
    }
  });

  return parts;
}

function createTextTexture(gl) {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 1024;

  const ctx = canvas.getContext('2d');

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = 'white';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  ctx.font = 'bold 80px serif';
  ctx.fillText('拖曳平移視角', canvas.width / 2, canvas.height / 5);

  const secondBaseLine = 3 * canvas.height / 5;
  const secondLineHeight = canvas.height / 7;
  ctx.font = 'bold 70px serif';
  ctx.fillText('透過滑鼠右鍵、滾輪', canvas.width / 2, secondBaseLine - secondLineHeight);
  ctx.fillText('或是多指觸控手勢', canvas.width / 2, secondBaseLine);
  ctx.fillText('對視角進行轉動、縮放', canvas.width / 2, secondBaseLine + secondLineHeight);

  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);

  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);

  gl.texImage2D(
    gl.TEXTURE_2D,
    0, // level
    gl.RGBA, // internalFormat
    gl.RGBA, // format
    gl.UNSIGNED_BYTE, // type
    canvas, // data
  );
  gl.generateMipmap(gl.TEXTURE_2D);

  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);

  return texture;
}

function renderSailboat(app, viewMatrix, programInfo) {
  const { gl, textures, objects } = app;

  const worldMatrix = matrix4.multiply(
    matrix4.yRotate(degToRad(45)),
    matrix4.translate(0, 0, 0),
    matrix4.scale(1, 1, 1),
  );

  twgl.setUniforms(programInfo, {
    u_matrix: matrix4.multiply(viewMatrix, worldMatrix),
    u_worldMatrix: worldMatrix,
    u_normalMatrix: matrix4.transpose(matrix4.inverse(worldMatrix)),
    u_normalMap: textures.nullNormal,
  });

  objects.sailboat.forEach(({ bufferInfo, vao, uniforms }) => {
    gl.bindVertexArray(vao);
    twgl.setUniforms(programInfo, uniforms);
    twgl.drawBufferInfo(gl, bufferInfo);
  });
}

function renderOcean(app, viewMatrix, reflectionViewMatrix, programInfo) {
  const {
    gl,
    textures, objects,
  } = app;

  gl.bindVertexArray(objects.plane.vao);

  const worldMatrix = matrix4.multiply(
    matrix4.translate(0, 0, 0),
    matrix4.scale(4000, 1, 4000),
  );

  twgl.setUniforms(programInfo, {
    u_matrix: matrix4.multiply(viewMatrix, worldMatrix),
    u_worldMatrix: worldMatrix,
    u_normalMatrix: matrix4.transpose(matrix4.inverse(worldMatrix)),
    u_normalMap: textures.oceanNormal,
    u_diffuse: [0, 0, 0],
    u_diffuseMap: textures.reflection,
    u_specularExponent: 200,
    u_emissive: [0, 0, 0],
    u_ambient: [0.4, 0.4, 0.4],
    u_reflectionMatrix: reflectionViewMatrix,
    u_normalMapSize: [16, 16],
  });

  twgl.drawBufferInfo(gl, objects.plane.bufferInfo);
}

function renderSkybox(app, projectionMatrix, inversedCameraMatrix) {
  const { gl, skyboxProgramInfo, objects, textures } = app;
  gl.bindVertexArray(objects.skybox.vao);

  twgl.setUniforms(skyboxProgramInfo, {
    u_skyboxMap: textures.skybox,
    u_matrix: matrix4.inverse(
      matrix4.multiply(
        projectionMatrix,
        [
          ...inversedCameraMatrix.slice(0, 12),
          0, 0, 0, inversedCameraMatrix[15], // remove translation
        ],
      ),
    ),
  });

  gl.depthFunc(gl.LEQUAL);
  twgl.drawBufferInfo(gl, objects.skybox.bufferInfo);
  gl.depthFunc(gl.LESS); // reset to default
}

function renderText(app, viewMatrix, programInfo) {
  const { gl, textures, objects } = app;

  gl.bindVertexArray(objects.plane.vao);

  const textLeftShift = gl.canvas.width / gl.canvas.height < 1.4 ? 0 : -0.9;
  const worldMatrix = matrix4.multiply(
    matrix4.translate(textLeftShift, 0, 0),
    matrix4.xRotate(degToRad(45)),
    matrix4.translate(0, 12.5, 0),
  );

  twgl.setUniforms(programInfo, {
    u_matrix: matrix4.multiply(viewMatrix, worldMatrix),
    u_diffuse: [0, 0, 0],
    u_diffuseMap: textures.text,
  });

  twgl.drawBufferInfo(gl, objects.plane.bufferInfo);
}

function render(app) {
  const {
    gl,
    programInfo,
    depthProgramInfo,
    oceanProgramInfo,
    skyboxProgramInfo,
    framebuffers, textures,
    state,
  } = app;

  const cameraMatrix = matrix4.multiply(
    matrix4.translate(...state.cameraViewing),
    matrix4.yRotate(state.cameraRotationXY[1]),
    matrix4.xRotate(state.cameraRotationXY[0]),
    matrix4.translate(0, 0, state.cameraDistance),
  );

  const projectionMatrix = matrix4.perspective(state.fieldOfView, gl.canvas.width / gl.canvas.height, 0.1, 2000);
  const inversedCameraMatrix = matrix4.inverse(cameraMatrix)

  const viewMatrix = matrix4.multiply(
    projectionMatrix,
    inversedCameraMatrix,
  );

  const reflectionCameraMatrix = matrix4.multiply(
    matrix4.translate(...state.cameraViewing),
    matrix4.yRotate(state.cameraRotationXY[1]),
    matrix4.xRotate(-state.cameraRotationXY[0]),
    matrix4.translate(0, 0, state.cameraDistance),
  );

  const inversedReflectionCameraMatrix = matrix4.inverse(reflectionCameraMatrix)

  const reflectionViewMatrix = matrix4.multiply(
    projectionMatrix,
    inversedReflectionCameraMatrix,
  );

  const lightProjectionViewMatrix = matrix4.multiply(
    matrix4.translate(1, -1, 0),
    matrix4.projection(20, 20, 10),
    [ // shearing
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, Math.tan(state.lightRotationXY[0]), 1, 0,
      0, 0, 0, 1,
    ],
    matrix4.inverse(
      matrix4.multiply(
        matrix4.yRotate(state.lightRotationXY[1]),
        matrix4.xRotate(degToRad(90)),
      )
    ),
  );

  const globalUniforms = {
    u_worldViewerPosition: cameraMatrix.slice(12, 15),
    u_lightDir: [
      -1 * Math.sin(state.lightRotationXY[0]) * Math.sin(state.lightRotationXY[1]),
      -1 * Math.cos(state.lightRotationXY[0]),
      -1 * Math.sin(state.lightRotationXY[0]) * Math.cos(state.lightRotationXY[1]),
    ],
    u_specular: [1, 1, 1],
    u_lightProjectionMatrix: lightProjectionViewMatrix,
    u_lightProjectionMap: textures.lightProjection,
  }

  { // lightProjection
    twgl.bindFramebufferInfo(gl, framebuffers.lightProjection);

    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    gl.useProgram(depthProgramInfo.program);

    renderOcean(app, lightProjectionViewMatrix, reflectionViewMatrix, depthProgramInfo);
    renderSailboat(app, lightProjectionViewMatrix, depthProgramInfo);
  }

  gl.useProgram(programInfo.program);
  twgl.setUniforms(programInfo, globalUniforms);

  { // reflection
    twgl.bindFramebufferInfo(gl, framebuffers.reflection);

    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    renderSailboat(app, reflectionViewMatrix, programInfo);

    gl.useProgram(skyboxProgramInfo.program);
    renderSkybox(app, projectionMatrix, inversedReflectionCameraMatrix);
  }

  gl.bindFramebuffer(gl.FRAMEBUFFER, null);

  twgl.resizeCanvasToDisplaySize(gl.canvas, state.resolutionRatio);
  gl.viewport(0, 0, canvas.width, canvas.height);

  gl.useProgram(programInfo.program);

  renderSailboat(app, viewMatrix, programInfo);
  renderText(app, viewMatrix, programInfo);

  gl.useProgram(oceanProgramInfo.program);
  twgl.setUniforms(oceanProgramInfo, globalUniforms);
  renderOcean(app, viewMatrix, reflectionViewMatrix, oceanProgramInfo);

  { // skybox
    gl.useProgram(skyboxProgramInfo.program);
    renderSkybox(app, projectionMatrix, inversedCameraMatrix);
  }
}

function startLoop(app, now = 0) {
  const timeDiff = now - app.time;
  app.time = now;

  inputUpdate(app.input, app.state);

  app.state.lightRotationXY[0] = Math.sin(now * 0.00041) * degToRad(45);
  app.state.lightRotationXY[1] = now * 0.00037;

  render(app, timeDiff);
  requestAnimationFrame(now => startLoop(app, now));
}

async function main() {
  const app = await setup();
  window.app = app;
  window.gl = app.gl;

  app.input = listenToInputs(app.gl.canvas, app.state);

  const resolutionSelect = document.getElementById('resolution-ratio');
  resolutionSelect.addEventListener('change', () => {
    app.state.resolutionRatio = parseFloat(resolutionSelect.value);
  });
  if (window.devicePixelRatio > 1) {
    const retinaOption = document.getElementById('resolution-ratio-retina');
    retinaOption.value = window.devicePixelRatio;
    retinaOption.disabled = false;
  }

  startLoop(app);
}
main();
