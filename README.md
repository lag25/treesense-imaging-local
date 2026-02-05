# TreeSense Imaging

TreeSense Imaging is a computer vision application designed to analyze tree imagery using a trained machine learning model.  
The project exposes a FastAPI backend for inference and serves a web-based interface for interaction and visualization especially to reproduce results locally.

## Features
- Image-based tree analysis using a pretrained model
- FastAPI backend for inference
- Web interface served locally
- Simple setup and execution

## Requirements
- Python 3.8+
- pip
- Virtual environment recommended

## Setup Instructions

### 1. Clone the repository
```bash
git clone https://github.com/lag25/treesense-imaging-local.git
cd treesense-imaging-local
```

### 2. Install Dependencies
```bash
pip install -r requirements.txt
```

### 3. Download the U-Net model
Download the trained model from [here](https://drive.google.com/file/d/1YKd5kwuThNBF6RgGO3pPg8svnvpZ9iZ0/view?usp=drive_link).
Place the downloaded model directly in the project root directory.
Do not rename or move the model file

### 4. Running the Application
Run
```bash
uvicorn app:app --host 0.0.0.0 --port 8000
```
Once running, open your browser and navigate to:
```bash
http://localhost:8000/index.html
```



