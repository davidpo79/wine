from PIL import Image, ImageFilter
import numpy as np
def inpaint(a, mask, noise=2.5, seed=1, scale=4, iters=600):
    """Diffusion fill of masked pixels (coarse), upsampled and lightly textured."""
    H,W=mask.shape
    ys,xs=np.where(mask); y0,y1=max(ys.min()-80,0),min(ys.max()+80,H); x0,x1=max(xs.min()-80,0),min(xs.max()+80,W)
    reg=a[y0:y1,x0:x1].copy(); m=mask[y0:y1,x0:x1]
    h,w=m.shape; hs,ws=h//scale,w//scale
    small=np.asarray(Image.fromarray(reg.astype(np.uint8)).resize((ws,hs),Image.BOX)).astype(np.float32)
    ms=np.asarray(Image.fromarray((m*255).astype(np.uint8)).resize((ws,hs),Image.BOX))>0
    f=small.copy(); f[ms]=small[~ms].mean(0)
    for _ in range(iters):
        p=np.pad(f,((1,1),(1,1),(0,0)),mode='edge')
        avg=(p[:-2,1:-1]+p[2:,1:-1]+p[1:-1,:-2]+p[1:-1,2:])/4
        f[ms]=avg[ms]
    big=np.asarray(Image.fromarray(np.clip(f,0,255).astype(np.uint8)).resize((w,h),Image.BICUBIC).filter(ImageFilter.GaussianBlur(scale))).astype(np.float32)
    # soft blend at the mask edge
    soft=np.asarray(Image.fromarray((m*255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(3))).astype(np.float32)[...,None]/255
    soft=np.maximum(soft,m[...,None].astype(np.float32))
    big+=np.random.default_rng(seed).normal(0,noise,big.shape)
    reg=reg*(1-soft)+big*soft
    out=a.copy(); out[y0:y1,x0:x1]=reg
    return np.clip(out,0,255)
