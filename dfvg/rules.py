from typing import List, Optional
from pydantic import BaseModel
from .detect import ClipMetadata
from .config import Config

class ProcessingRule(BaseModel):
    apply_lut: bool
    lut_path: Optional[str] = None
    output_types: List[str] = ["proxy", "preview"]  # "proxy", "preview", "master"
    normalization: bool = False

class RulesEngine:
    def __init__(self, config: Config):
        self.config = config

    def evaluate(self, meta: ClipMetadata) -> ProcessingRule:
        """
        Determines the processing rules for a given clip.
        """
        
        # Rule A - DJI Action 5 Pro (D-Log M + 10-bit)
        if meta.color_profile == "D-Log M" and meta.bit_depth == 10:
            return ProcessingRule(
                apply_lut=True,
                lut_path=str(self.config.LUT_PATH) if self.config.LUT_PATH else None,
                output_types=["proxy", "preview", "master"]
            )
            
        # Rule B - DJI Action 2 (D-Cinelike) OR Action 5 Pro (D-Log M but no LUT found?)
        # User specified: Action 2 D-Cinelike -> No LUT, Mild Normalization.
        # Check: Action 2 usually 8-bit.
        # If we identified it as Action 2/D-Cinelike:
        if meta.color_profile == "D-Cinelike" or (meta.camera_model and "Action 2" in meta.camera_model):
            return ProcessingRule(
                apply_lut=False,
                normalization=True, # Mild contrast normalization
                output_types=["proxy", "preview", "master"] # "Master" here means Normalized
            )

        # Rule C - Normal Profile (generates all variants)
        return ProcessingRule(
            apply_lut=False,
            output_types=["proxy", "preview", "master"]
        )
