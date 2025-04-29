import { HandLandmarker, FilesetResolver } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0";

const demosSection = document.getElementById("demos");
let handLandmarker = undefined;
let enableWebcamButton;
let switchCameraButton;
let webcamRunning = false;
let ringOptions;
let ringImages = {};
let currentRingImage;
let selectedRingOption;
let currentFacingMode = "user";
let currentStream = null;
let showSkeleton = true;

const video = document.getElementById("webcam");
const capturedCanvas = document.getElementById("capturedCanvas");
const capturedCtx = capturedCanvas.getContext("2d");
let capturedImageData = null;
let capturedResults = null;

const createHandLandmarker = async () => {
    const vision = await FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm");
    handLandmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: {
            modelAssetPath: `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`,
            delegate: "GPU"
        },
        runningMode: "IMAGE",
        numHands: 2
    });
    demosSection.classList.remove("invisible");
};
createHandLandmarker();

function setupRingSelection() {
    ringOptions = document.querySelectorAll(".ring-option");
    ringOptions.forEach(option => {
        option.replaceWith(option.cloneNode(true));
    });
    ringOptions = document.querySelectorAll(".ring-option");
    ringOptions.forEach(option => {
        const handleSelection = function() {
            ringOptions.forEach(opt => opt.classList.remove('selected'));
            this.classList.add('selected');
            const ringPath = this.getAttribute('data-ring');
            currentRingImage = ringImages[ringPath];
            selectedRingOption = this;
            drawCapturedImage();
            console.log("Ring selected:", ringPath);
        };
        option.addEventListener('click', handleSelection);
        option.addEventListener('touchend', function(e) {
            e.preventDefault();
            handleSelection.call(this);
        });
    });
    if (!selectedRingOption && ringOptions.length > 0) {
        ringOptions[0].classList.add('selected');
        const ringPath = ringOptions[0].getAttribute('data-ring');
        currentRingImage = ringImages[ringPath];
        selectedRingOption = ringOptions[0];
    }
}

function preloadRingImages() {
    const options = document.querySelectorAll('.ring-option');
    options.forEach(option => {
        const src = option.getAttribute('data-ring');
        const img = new Image();
        img.src = src;
        img.onload = function () {
            const imgElement = option.querySelector('img');
            if (imgElement) imgElement.src = src;
        };
        ringImages[src] = img;
        if (!currentRingImage) currentRingImage = img;
    });
}

const hasGetUserMedia = () => !!navigator.mediaDevices?.getUserMedia;
const isMobile = () => /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || (window.innerWidth <= 767);

if (isMobile()) currentFacingMode = "environment";

if (hasGetUserMedia()) {
    enableWebcamButton = document.getElementById("webcamButton");
    enableWebcamButton.addEventListener("click", enableCam);
    switchCameraButton = document.getElementById("switchCameraButton");
    switchCameraButton.addEventListener("click", switchCamera);
} else {
    console.warn("getUserMedia() is not supported by your browser");
}

function enableCam(event) {
    if (!handLandmarker) {
        console.log("Wait! handLandmarker not loaded yet.");
        return;
    }
    if (webcamRunning) {
        webcamRunning = false;
        enableWebcamButton.innerText = "ENABLE WEBCAM";
        if (video.srcObject) {
            video.srcObject.getTracks().forEach(track => track.stop());
            video.srcObject = null;
            currentStream = null;
        }
    } else {
        webcamRunning = true;
        enableWebcamButton.innerText = "DISABLE WEBCAM";
        const captureButton = document.getElementById("captureButton");
        captureButton.addEventListener("click", capturePhoto);
        const constraints = { 
            video: { 
                facingMode: currentFacingMode,
                width: { ideal: 640 },
                height: { ideal: 480 }
            } 
        };
        navigator.mediaDevices.getUserMedia(constraints)
            .then((stream) => {
                currentStream = stream;
                video.srcObject = stream;
            })
            .catch((err) => {
                console.error("Error accessing webcam:", err);
                navigator.mediaDevices.getUserMedia({ video: true })
                    .then((stream) => {
                        currentStream = stream;
                        video.srcObject = stream;
                        webcamRunning = true;
                        enableWebcamButton.innerText = "DISABLE WEBCAM";
                    })
                    .catch((err) => {
                        console.error("Error accessing any camera:", err);
                        webcamRunning = false;
                        enableWebcamButton.innerText = "ENABLE WEBCAM";
                        alert("Could not access any camera. Please check permissions.");
                    });
            });
    }
}

function switchCamera() {
    if (!currentStream) {
        console.log("Camera not started yet.");
        return;
    }
    currentStream.getTracks().forEach(track => track.stop());
    currentStream = null;
    currentFacingMode = currentFacingMode === "user" ? "environment" : "user";
    navigator.mediaDevices.getUserMedia({ 
        video: { 
            facingMode: currentFacingMode,
            width: { ideal: 640 },
            height: { ideal: 480 }
        } 
    })
    .then((stream) => {
        currentStream = stream;
        video.srcObject = stream;
    })
    .catch((err) => {
        console.error("Error switching camera:", err);
        navigator.mediaDevices.getUserMedia({ video: true })
            .then((stream) => {
                currentStream = stream;
                video.srcObject = stream;
            })
            .catch((err) => {
                console.error("Failed to access any camera:", err);
            });
    });
}

async function capturePhoto() {
    if (!webcamRunning || !handLandmarker) return;

    capturedCanvas.width = video.videoWidth;
    capturedCanvas.height = video.videoHeight;
    capturedCanvas.style.display = "block";

    capturedCtx.save();
    capturedCtx.scale(-1, 1);
    capturedCtx.drawImage(video, -video.videoWidth, 0, video.videoWidth, video.videoHeight);
    capturedCtx.restore();

    capturedImageData = capturedCtx.getImageData(0, 0, capturedCanvas.width, capturedCanvas.height);

    // Perform hand detection on the captured image
    const startTimeMs = performance.now();
    capturedResults = await handLandmarker.detect(capturedCanvas);

    if (!ringOptions || ringOptions.length === 0) {
        preloadRingImages();
        setupRingSelection();
    }

    drawCapturedImage();
}

function drawCapturedImage() {
    if (!capturedImageData) return;

    capturedCtx.clearRect(0, 0, capturedCanvas.width, capturedCanvas.height);
    capturedCtx.putImageData(capturedImageData, 0, 0);

    if (capturedResults && capturedResults.landmarks) {
        capturedResults.landmarks.forEach((landmarks) => {
            // Draw skeleton only if showSkeleton is true
            if (showSkeleton) {
                drawConnectors(capturedCtx, landmarks, HAND_CONNECTIONS, { color: "#ff0000", lineWidth: 0.25 });
                drawLandmarks(capturedCtx, landmarks, { color: "#cccc00", lineWidth: 0.0002 });
            }

            // Always draw the ring regardless of showSkeleton
            const landmark13 = landmarks[13]; // Ring finger proximal joint
            const landmark14 = landmarks[14]; // Ring finger middle joint
            const centerX = (landmark13.x + landmark14.x) / 2 * capturedCanvas.width;
            const centerY = (landmark13.y + landmark14.y) / 2 * capturedCanvas.height;
            const angle = Math.atan2(landmark14.y - landmark13.y, landmark14.x - landmark13.x) + Math.PI / 2;

            const indexMCP = landmarks[5];
            const pinkyMCP = landmarks[13];
            const palmWidth = Math.sqrt(
                Math.pow(pinkyMCP.x - indexMCP.x, 2) +
                Math.pow(pinkyMCP.y - indexMCP.y, 2)
            ) * capturedCanvas.width;

            let ringScaleFactor = 0.6;
            if (window.innerWidth <= 480) ringScaleFactor = 0.35;
            else if (window.innerWidth <= 767) ringScaleFactor = 0.375;

            const ringWidth = palmWidth * ringScaleFactor;
            const ringHeight = ringWidth * 0.8;

            if (currentRingImage) {
                capturedCtx.save();
                capturedCtx.translate(centerX, centerY);
                capturedCtx.rotate(angle);
                capturedCtx.drawImage(currentRingImage, -ringWidth / 2, -ringHeight / 2, ringWidth, ringHeight);
                capturedCtx.restore();
            }
        });
    }
}

function resizeCanvas() {
    if (!video.videoWidth) return;
    const videoAspect = video.videoWidth / video.videoHeight;
    const maxWidth = video.parentElement.clientWidth;
    const maxHeight = video.parentElement.clientHeight;
    let canvasWidth = maxWidth;
    let canvasHeight = canvasWidth / videoAspect;
    if (canvasHeight > maxHeight) {
        canvasHeight = maxHeight;
        canvasWidth = canvasHeight * videoAspect;
    }
    capturedCanvas.width = video.videoWidth;
    capturedCanvas.height = video.videoHeight;
    updateLogoPosition();
}

function updateLogoPosition() {
    const logoContainer = document.getElementById('logo-container');
    if (logoContainer) logoContainer.style.width = `${video.videoWidth}px`;
}

document.addEventListener('DOMContentLoaded', () => {
    const skeletonCheckbox = document.getElementById("skeletonCheckbox");
    skeletonCheckbox.addEventListener('change', (event) => {
        showSkeleton = event.target.checked;
        drawCapturedImage();
    });
    const viewButtonWomen = document.querySelector('.view-button-women');
    const optionsContainerWomen = document.querySelector('.ring-options-container-women');
    if (viewButtonWomen && optionsContainerWomen) {
        viewButtonWomen.addEventListener('click', function () {
            if (optionsContainerWomen.style.display === 'none' || optionsContainerWomen.style.display === '') {
                optionsContainerWomen.style.display = 'block';
                viewButtonWomen.textContent = 'Hide Options';
            } else {
                optionsContainerWomen.style.display = 'none';
                viewButtonWomen.textContent = 'View Options';
                
            }
        });
    }
    const viewButtonMen = document.querySelector('.view-button-men');
    const optionsContainerMen = document.querySelector('.ring-options-container-men');
    if (viewButtonMen && optionsContainerMen) {
        viewButtonMen.addEventListener('click', function () {
            if (optionsContainerMen.style.display === 'none' || optionsContainerMen.style.display === '') {
                optionsContainerMen.style.display = 'block';
                viewButtonMen.textContent = 'Hide Options';
            } else {
                optionsContainerMen.style.display = 'none';
                viewButtonMen.textContent = 'View Options';
            }
        });
    }
    window.addEventListener('resize', resizeCanvas);
    window.addEventListener('orientationchange', resizeCanvas);
});

window.addEventListener('DOMContentLoaded', (event) => {
    checkOrientation();
    window.addEventListener('resize', checkOrientation);
    window.addEventListener('orientationchange', checkOrientation);
});

function checkOrientation() {
    // Add orientation logic here if required
}