import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader'
import { MeshSurfaceSampler } from 'three/addons/math/MeshSurfaceSampler.js';
import { Water } from 'three/addons/objects/Water2.js';
import * as dat from 'lil-gui'
import { RGBELoader } from "three/examples/jsm/loaders/RGBELoader.js"
import fireFragmentShader from '../shaders/fire_fragment.glsl'
import fireVertexShader from '../shaders/fire_vertex.glsl'

// VARS
let candlestick
let bowl
let tube1
let tube2
let tree1
let leaf1
let leaf1Instance
let branches1
let branches1Sampler
let pipes
let disc
let water
const tree1_grp = new THREE.Group()

//LOADERS
const gltfLoader = new GLTFLoader()
const objLoader = new OBJLoader()
const textureLoader = new THREE.TextureLoader()
const rgbeLoader = new RGBELoader()

// SCENE SETTINGS
const canvas = document.querySelector(".webgl")
const sizes = {
    width: window.innerWidth,
    height: window.innerHeight
}
const scene = new THREE.Scene()
const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true
})
const camera = new THREE.PerspectiveCamera(75, sizes.width / sizes.height, 0.1, 100)
scene.add(new THREE.GridHelper(4, 4))

// TEXTURES
const oldTestamentDiff = textureLoader.load('./textures/old_testament_label.jpg')
const newTestamentDiff = textureLoader.load('./textures/new_testament_label.jpg')
const labelAlpha = textureLoader.load('./textures/label_alpha.png')
const bump_bowl = textureLoader.load('./textures/bump_bowl.png')
const matcap_gold_diff = textureLoader.load('./textures/matcap_gold_00.jpg')
const fireTex = textureLoader.load('./textures/Fire_01.png')
const flowMap = textureLoader.load('textures/Water_1_M_Flow.jpg');


//BREAD FAN
const renderTarget = new THREE.WebGLRenderTarget()
// renderTarget.depthTexture = new THREE.DepthTexture()

const geometry = new THREE.BufferGeometry()
geometry.setDrawRange(0, 3)

const material = new THREE.ShaderMaterial({
    depthTest: false,
    depthWrite: true,
    transparent: true,
    vertexShader: `
    uniform mat4 viewMatrixInverse;
    uniform mat4 projectionMatrixInverse;
    out vec3 vPosition;
    out vec2 vUv;
    out vec4 vClip;

    void main() {
      vPosition = viewMatrixInverse[3].xyz - modelMatrix[3].xyz;
      vUv = vec2(gl_VertexID << 1 & 2, gl_VertexID & 2);
      gl_Position = vec4(vUv * 2.0 - 1.0, 0, 1);
      vClip = projectionMatrixInverse * gl_Position;
    }
  `,
    fragmentShader: `
    uniform sampler2D tDepth;
    uniform float cameraNear;
    uniform float cameraFar;
    uniform mat4 viewMatrixInverse;
    in vec3 vPosition;
    in vec2 vUv;
    in vec4 vClip;

    #include <common>
    #include <packing>

    void main() {
      // Configure ray in world-space from camera
      vec3 position = vPosition;
      vec3 direction = normalize((viewMatrixInverse * vec4(vClip.xyz / vClip.w, 0)).xyz);

      // Raymarch a simple sphere within frustum
      float distance = cameraNear;
      for (int i = 0; i < 100; i++) {
        float density = length(position) - 1.0;
        position += direction * density;
        distance += density;

        if (density < EPSILON || distance >= cameraFar) break;
      }

      // Set fragment depth from view-space position
      vec4 viewPosition = viewMatrix * vec4(position, 1);
      gl_FragDepth = viewZToPerspectiveDepth(viewPosition.z, cameraNear, cameraFar);

      // Manual depth test for mesh occlusion
      float sceneDepth = texture(tDepth, vUv).r;
      if (gl_FragDepth >= sceneDepth * 0.9999) discard;
      

      // Render spherical world-space normals
      vec3 normal = normalize(position - vec3(0, 0.5, 0));
      gl_FragColor = vec4(normal * 0.5 + 0.5, 1);

      #include <tonemapping_fragment>
      #include <encodings_fragment>
    }
  `,
    uniforms: {
        tDepth: { value: renderTarget.depthTexture },
        cameraNear: { value: camera.near },
        cameraFar: { value: camera.far },
        viewMatrixInverse: { value: camera.matrixWorld },
        projectionMatrixInverse: { value: camera.projectionMatrixInverse }
    }
})
const mesh = new THREE.Mesh(geometry, material);
mesh.frustumCulled = false;
// scene.add(mesh);

const wireframeMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(0xffffff),
    wireframe: true
});

// const gui = new dat.GUI()
const global = {
    leaf1InstanceCount: 20000,
    oliveInstanceCount: 800
}

const yelowMaterial = new THREE.MeshStandardMaterial({ color: "yellow", side: THREE.DoubleSide })
const greenMaterial = new THREE.MeshBasicMaterial({ color: "green", side: THREE.DoubleSide })
const redMaterial = new THREE.MeshBasicMaterial({ color: "red", side: THREE.DoubleSide })
const blueMaterial = new THREE.MeshBasicMaterial({ color: "blue", side: THREE.DoubleSide })
const branchMaterial = new THREE.MeshBasicMaterial({ color: "brown", side: THREE.DoubleSide })
const oldTestamentMaterial = new THREE.MeshBasicMaterial({ map: oldTestamentDiff, side: THREE.DoubleSide, alphaMap: labelAlpha, transparent: true })
const newTestamentMaterial = new THREE.MeshBasicMaterial({ map: newTestamentDiff, side: THREE.DoubleSide, alphaMap: labelAlpha, transparent: true })
const matcap_gold = new THREE.MeshMatcapMaterial({ matcap: matcap_gold_diff, side: THREE.DoubleSide, bumpMap: bump_bowl, bumpScale: 0.05 });
const depthMaterial = new THREE.ShaderMaterial()

//FIRE EFFECT
const FireClass = function (fireTex, color) {
 const fireMaterial  = new THREE.ShaderMaterial({
        depthTest: false,
        depthWrite: true,
        transparent: true,
        defines: {
            "ITERATIONS": "20",
            "OCTIVES": "3"
        },
        uniforms: {
            fireTex: { type: "t", value: null },
            color: { type: "c", value: null },
            time: { type: "f", value: 0.0 },
            seed: { type: "f", value: 0.0 },
            invModelMatrix: { type: "m4", value: null },
            scale: { type: "v3", value: null },
            noiseScale: { type: "v4", value: new THREE.Vector4(1, 2, 1, 0.3) },
            magnitude: { type: "f", value: 1.3 },
            lacunarity: { type: "f", value: 2.0 },
            gain: { type: "f", value: 0.5 },



        },
        vertexShader: fireVertexShader,
        fragmentShader: fireFragmentShader,
        transparent: true,
        depthWrite: false,
        depthTest: false
    })

    fireTex.magFilter = fireTex.minFilter = THREE.LinearFilter;
    fireTex.wrapS = fireTex.wrapT = THREE.ClampToEdgeWrapping;

    fireMaterial.uniforms.fireTex.value = fireTex;
    fireMaterial.uniforms.color.value = color || new THREE.Color(0xeeeeee);
    fireMaterial.uniforms.invModelMatrix.value = new THREE.Matrix4();
    fireMaterial.uniforms.scale.value = new THREE.Vector3(1, 1, 1);
    fireMaterial.uniforms.seed.value = Math.random() * 19.19;

    return new THREE.Mesh(new THREE.BoxGeometry(1.0, 2.0, 1.0), fireMaterial);
}
const Fire = new FireClass(fireTex);
Fire.prototype = Object.create(THREE.Mesh.prototype);
Fire.prototype.constructor = FireClass;

const wireframe = new THREE.Mesh(Fire.geometry, wireframeMat.clone());
Fire.add(wireframe);
wireframe.visible = false;

Fire.position.y = 6.85
Fire.scale.set(2, 3, 2)

Fire.update = function (time) {

    const invModelMatrix = Fire.material.uniforms.invModelMatrix.value;

    Fire.updateMatrixWorld();
    invModelMatrix.copy(Fire.matrixWorld).invert();

    if (time !== undefined) {
        Fire.material.uniforms.time.value = time;
    }

    Fire.material.uniforms.invModelMatrix.value = invModelMatrix;

    Fire.material.uniforms.scale.value = Fire.scale;
};

const onUpdateMat = function () {
    Fire.material.uniforms.magnitude.value = controller.magnitude;
    Fire.material.uniforms.lacunarity.value = controller.lacunarity;
    Fire.material.uniforms.gain.value = controller.gain;
    Fire.material.uniforms.noiseScale.value = new THREE.Vector4(
        controller.noiseScaleX,
        controller.noiseScaleY,
        controller.noiseScaleZ,
        0.3
    );
};

scene.add(Fire);

// GUI
const controller = {
    speed: 1.0,
    magnitude: 0.2,
    lacunarity: 2.0,
    gain: 0.1,
    noiseScaleX: 2.6,
    noiseScaleY: 1.8,
    noiseScaleZ: 0,
    wireframe: false
};

// gui.add(controller, "speed", 0.1, 10.0).step(0.1);
// gui.add(controller, "magnitude", 0.2, 10.0).step(0.1).onChange(onUpdateMat);
// gui.add(controller, "lacunarity", 0.0, 10.0).step(0.1).onChange(onUpdateMat);
// gui.add(controller, "gain", 0.0, 5.0).step(0.1).onChange(onUpdateMat);
// gui.add(controller, "noiseScaleX", 0.5, 5.0).step(0.1).onChange(onUpdateMat);
// gui.add(controller, "noiseScaleY", 0.5, 5.0).step(0.1).onChange(onUpdateMat);
// gui.add(controller, "noiseScaleZ", 0.5, 5.0).step(0.1).onChange(onUpdateMat);
// gui.add(controller, "wireframe").onChange(function () {
//     const wireframe = Fire.children[0];
//     wireframe.visible = controller.wireframe;
// });

//OLIVES
const radius = .1; // Radius of the sphere
const widthSegments = 32; // Number of horizontal segments
const heightSegments = 32; // Number of vertical segments
const sphereGeometry = new THREE.SphereGeometry(radius, widthSegments, heightSegments);

const olive = new THREE.Mesh(sphereGeometry, yelowMaterial)
olive.scale.set(1, 1.5, 1)


gltfLoader.load('./models/gltf/candlestick.gltf', (gltf) => {

    const gltfScene = gltf.scene
    gltfScene.traverse(child => {
        if (child.isMesh) {
            candlestick = child
            candlestick.material = yelowMaterial
        }
    })
    scene.add(candlestick)
})

gltfLoader.load('./models/gltf/Tube.gltf', (gltf) => {
    const gltfScene = gltf.scene
    gltfScene.traverse(child => {
        if (child.isMesh) {
            tube1 = child
            tube1.material = yelowMaterial
            tube1.position.set(0, -6, 0)
            tube1.rotateY(1.5)
            tube1.scale.set(.8, .8, .8)
        }
    })
    scene.add(tube1)
})

gltfLoader.load('./models/gltf/Tube.gltf', (gltf) => {
    const gltfScene = gltf.scene
    gltfScene.traverse(child => {
        if (child.isMesh) {
            tube2 = child
            tube2.material = yelowMaterial
            tube2.position.set(0, -6, 0)
            tube2.rotateY(-1.5)
            tube2.scale.set(.8, .8, .8)
        }
    })
    scene.add(tube2)
})

gltfLoader.load('./models/gltf/pipes.gltf', (gltf) => {
    const gltfScene = gltf.scene
    gltfScene.traverse(child => {
        if (child.isMesh) {
            pipes = child
            pipes.material = redMaterial
        }
    })
    pipes.position.y = -5.2
    scene.add(pipes)
})

objLoader.load('./models/obj/label.obj', (label) => {

    label.traverse(child => {
        if (child.isMesh) {
            label = child
            label.material = oldTestamentMaterial
        }
    })
    label.position.y = -12
    label.position.x = -5
    label.position.z = 4
    scene.add(label)
})

objLoader.load('./models/obj/label.obj', (label) => {

    label.traverse(child => {
        if (child.isMesh) {
            label = child
            label.material = newTestamentMaterial
        }
    })
    label.position.y = -12
    label.position.x = 43
    label.position.z = 4
    scene.add(label)
})

objLoader.load('./models/obj/bowl.obj', (label) => {

    label.traverse(child => {
        if (child.isMesh) {
            bowl = child
            bowl.material = matcap_gold
            bowl.position.set(0, -5, 0)
            // bowl.scale.set(.6, .6, .6)
        }
    })
    scene.add(bowl)
})

objLoader.load('./models/obj/Tree_08_Main.obj', (tree) => {
    tree.traverse(child => {
        if (child.isMesh) {
            console.log("jhgkgk", child)
            tree1 = child
            tree1.material = branchMaterial
        }
    })
})

objLoader.load('./models/obj/Tree_08_Branches.obj', (branches) => {
    branches.traverse(child => {
        if (child.isMesh) {
            branches1 = child
            branches1.material = greenMaterial
            branches1Sampler = new MeshSurfaceSampler(branches1).build();
            console.log("Branch 1 Sampler")
        }
    })
    scene.add(branches1)
}, (progress) => {
    console.log(progress)
})

objLoader.load('./models/obj/Tree_08_Leaf.obj', (leaf) => {
 
    leaf.traverse(child => {
        if (child.isMesh) {
            leaf1 = child
            leaf1Instance = new THREE.InstancedMesh(leaf1.geometry, greenMaterial, global.leaf1InstanceCount)
        }
    })
})


const instancedPosition = new THREE.Vector3();
const leafMatrix = new THREE.Matrix4();
const matrixRotation = new THREE.Matrix4();
const matrixScale = new THREE.Matrix4();

const oliveMatrix = new THREE.Matrix4();
const oliveMatrixRotation = new THREE.Matrix4();
const oliveMatrixScale = new THREE.Matrix4();
const oliveInstance = new THREE.InstancedMesh(olive.geometry, yelowMaterial, global.oliveInstanceCount)

//INSTANCE LEAFS AND OLIVES
gltfLoader.manager.onLoad = function () {

    //Poisition Instanced Leaves
    for (let i = 0; i < global.leaf1InstanceCount; i++) {
        branches1Sampler.sample(instancedPosition);

        const angleX = Math.random() * Math.PI * 2
        const angleZ = Math.random() * Math.PI * 2
        const angleY = Math.random() * Math.PI * 2
        matrixRotation.makeRotationX(angleX)
        matrixRotation.makeRotationZ(angleZ)
        matrixRotation.makeRotationY(angleY)
        const scale = 0.7 + 0.4 * Math.random()

        matrixScale.makeScale(scale, 1, 1)

        leafMatrix.makeTranslation(instancedPosition.x, instancedPosition.y, instancedPosition.z);
        leafMatrix.multiply(matrixRotation)
        leafMatrix.multiply(matrixScale)

        leaf1Instance.setMatrixAt(i, leafMatrix);
    }

    //Poisition Instanced Olives
    for (let i = 0; i < global.oliveInstanceCount; i++) {
        branches1Sampler.sample(instancedPosition);

        const angleX = Math.random() * Math.PI * 2
        const angleZ = Math.random() * Math.PI * 2
        const angleY = Math.random() * Math.PI * 2
        oliveMatrixRotation.makeRotationX(angleX)
        oliveMatrixRotation.makeRotationZ(angleZ)
        oliveMatrixRotation.makeRotationY(angleY)
        const scale = 0.7 + 0.4 * Math.random()

        oliveMatrixScale.makeScale(scale, 1, 1)

        oliveMatrix.makeTranslation(instancedPosition.x, instancedPosition.y, instancedPosition.z);
        oliveMatrix.multiply(oliveMatrixRotation)
        oliveMatrix.multiply(oliveMatrixScale)

        oliveInstance.setMatrixAt(i, oliveMatrix);
    }
    tree1_grp.add(tree1, leaf1Instance, branches1, oliveInstance)
    const tree2_grp = tree1_grp.clone()
    tree1_grp.position.set(-25, -10, 0)
    tree1_grp.rotateY(Math.PI)

    tree2_grp.rotateY(Math.PI * 180)
    tree2_grp.position.set(25, -10, 0)

    scene.add(tree1_grp, tree2_grp)
    gui.add(renderer.info.render, "triangles").name('Polygons')
}



objLoader.load('./models/obj/disc.obj', (discGeo) => {

    discGeo.traverse(child => {
        if (child.isMesh) {
            disc = child

            water = new Water(disc.geometry, {
                scale: 1.8,
                textureWidth: 1024,
                textureHeight: 1024,
                flowMap: flowMap,
                color: "orange",
                flowSpeed: .25

            });

            water.position.y = -5;
            // water.rotation.x = Math.PI * - 0.5;
            scene.add(water);

            // flow map helper
            const helperGeometry = new THREE.PlaneGeometry(20, 20);
            const helperMaterial = new THREE.MeshBasicMaterial({ map: flowMap });
            const helper = new THREE.Mesh(helperGeometry, helperMaterial);
            helper.position.y = 1.01;
            helper.rotation.x = Math.PI * - 0.5;
            helper.visible = false;
            scene.add(helper);

        }
    })

})

//ENV
rgbeLoader.load('/environments/kloofendal_48d_partly_cloudy_puresky_2k.hdr', (envMap) => {
    envMap.mapping = THREE.EquirectangularReflectionMapping

    scene.background = envMap
    scene.environment = envMap
})

const axesHelper = new THREE.AxesHelper(5);
axesHelper.position.set(0, -10, 0)
// scene.add(axesHelper);


camera.position.z = 50
scene.add(camera)


renderer.setSize(sizes.width, sizes.height)



const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true
controls.update()
const light = new THREE.AmbientLight(0x404040)
light.intensity = 10
scene.add(light)

renderer.setPixelRatio(window.devicePixelRatio);
renderer.render(scene, camera)
const clock = new THREE.Clock()

window.addEventListener('resize', () => {
    // Update sizes
    sizes.width = window.innerWidth
    sizes.height = window.innerHeight

    // Update camera
    camera.aspect = sizes.width / sizes.height
    camera.updateProjectionMatrix()

    // Update renderer
    renderer.setSize(sizes.width, sizes.height)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
})

const tick = () => {

    const elaspedTime = clock.getElapsedTime()

    var t = elaspedTime * controller.speed;

    // Fire.update(t);

    // Update controls
    controls.update()
    // camera.rotation.y +=(  Math.sin(elaspedTime)) * .2

    // camera.lookAt(10,0,0)
    // Render
    // Mesh depth pre-pass (TODO: blit and depth compare)
    renderer.setRenderTarget(renderTarget);
    scene.overrideMaterial = depthMaterial;
    renderer.render(scene, camera);

    // Render beauty with volumetrics
    renderer.setRenderTarget(null);
    scene.overrideMaterial = null;
    renderer.render(scene, camera);

    // Call tick again on the next frame
    window.requestAnimationFrame(tick)


    // scene.overrideMaterial = depthMaterial;
}

tick()