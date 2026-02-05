from fastapi import FastAPI, File, UploadFile
from fastapi.responses import StreamingResponse
from PIL import Image
import tensorflow as tf
import io
from fastapi.middleware.cors import CORSMiddleware
import pathfinder
import numpy as np
from pydantic import BaseModel
from typing import List
from PIL import Image
import numpy as np
import io
import math


app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

class FindPathRequest(BaseModel):
    image_array: List[List[int]]      # or List[int] if it's flattened
    start_pixel: List[int]             # [row, col]
    target_pixel: List[int]            # [row, col]

model = tf.keras.models.load_model("actual_seg_model.keras")
IMG_SIZE = 128

@app.post("/segment")
async def segment_image(file: UploadFile = File(...)):
    # Read image
    image = Image.open(io.BytesIO(await file.read())).convert("RGB")
    original_w, original_h = image.size

    tile_size = 128

    # --- PAD IMAGE ---
    padded_w = math.ceil(original_w / tile_size) * tile_size
    padded_h = math.ceil(original_h / tile_size) * tile_size

    padded_image = Image.new("RGB", (padded_w, padded_h))
    padded_image.paste(image, (0, 0))

    # --- TILE IMAGE ---
    tiles = []
    positions = []

    for y in range(0, padded_h, tile_size):
        for x in range(0, padded_w, tile_size):
            tile = padded_image.crop((x, y, x + tile_size, y + tile_size))
            tile_arr = np.array(tile, dtype=np.float32) / 255.0
            tiles.append(tile_arr)
            positions.append((x, y))

    tiles = np.stack(tiles, axis=0)

    # --- MODEL PREDICTION ---
    preds = model.predict(tiles, batch_size=8)
    preds = preds.reshape(len(preds), tile_size, tile_size)

    # --- RECONSTRUCT MASK ---
    mask = Image.new("L", (padded_w, padded_h))

    for pred, (x, y) in zip(preds, positions):
        tile_mask = Image.fromarray(
            (pred * 255).astype(np.uint8),
            mode="L"
        )
        mask.paste(tile_mask, (x, y))

    # --- CROP BACK TO ORIGINAL SIZE ---
    mask = mask.crop((0, 0, original_w, original_h))

    # --- RETURN IMAGE ---
    buf = io.BytesIO()
    mask.save(buf, format="PNG")
    buf.seek(0)

    return StreamingResponse(buf, media_type="image/png")


@app.post("/find_path")
async def optimal_path(data: FindPathRequest):
    image_array = data.image_array
    start_pixel = data.start_pixel
    target_pixel = data.target_pixel
    path_calculator = pathfinder.OptimalPathing()
    shortest_path = path_calculator.compute_path(image_array, start_pixel, target_pixel)
    print(shortest_path)
    return {"path":shortest_path}