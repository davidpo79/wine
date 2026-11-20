from PIL import Image, ImageFilter, ImageEnhance
import numpy as np, sys
W,H=1080,1920; TOP,BOT=int(H*.14),int(H*.80)
def story(src,out,feather=60):
    im=Image.open(src).convert('RGB')
    s=max(W/im.width,H/im.height); bg=im.resize((round(im.width*s),round(im.height*s)),Image.LANCZOS)
    bg=bg.crop(((bg.width-W)//2,(bg.height-H)//2,(bg.width-W)//2+W,(bg.height-H)//2+H)).filter(ImageFilter.GaussianBlur(60))
    bg=ImageEnhance.Color(bg).enhance(0.35)
    a=np.asarray(bg).astype(np.float32)*0.42
    y=np.arange(H)[:,None,None]; g=np.clip(np.minimum(y/TOP, (H-y)/(H-BOT)),0.35,1)
    bg=Image.fromarray((a*g).astype(np.uint8))
    h=BOT-TOP; w=round(im.width*h/im.height)
    if w>W: w=W; h=round(im.height*W/im.width)
    fg=im.resize((w,h),Image.LANCZOS); x=(W-w)//2; yy=TOP+(BOT-TOP-h)//2
    ramp=lambda n: np.clip(np.arange(n)/feather,0,1)
    m=np.ones((h,w),np.float32)*ramp(h)[:,None]*ramp(h)[::-1][:,None]
    if x>0: m=m*ramp(w)[None,:]*ramp(w)[::-1][None,:]
    bg.paste(fg,(x,yy),Image.fromarray((m*255).astype(np.uint8))); bg.save(out,quality=92)
story(sys.argv[1],sys.argv[2],int(sys.argv[3]))
