# VLM Model Setup Instructions

## Quick Setup

1. **Copy your model files** from your existing ml-fastvlm directory:
   ```bash
   cp -r ~/Desktop/ml-fastvlm/checkpoints/llava-fastvithd_1.5b_stage3 ./vlm-models/checkpoints/
   ```

2. **Verify the structure** looks like this:
   ```
   vlm-models/
   ├── checkpoints/
   │   └── llava-fastvithd_1.5b_stage3/
   │       ├── config.json
   │       ├── pytorch_model.bin (or similar)
   │       └── other model files...
   └── .gitkeep
   ```

3. **Restart the app** - VLM should now load from the local directory

## Benefits

- ✅ **Self-contained**: No external dependencies on ~/Desktop/ml-fastvlm
- ✅ **Portable**: App can be moved anywhere
- ✅ **Git-ignored**: Large model files won't be committed
- ✅ **Clean**: No hardcoded absolute paths

## Troubleshooting

If VLM model loading fails, check:
1. Model files exist in `vlm-models/checkpoints/llava-fastvithd_1.5b_stage3/`
2. Python dependencies are installed in app's venv
3. Check logs for path resolution issues