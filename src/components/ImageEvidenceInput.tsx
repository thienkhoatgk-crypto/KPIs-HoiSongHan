import React, { useState } from 'react';
import { Camera, PlusCircle, Trash2, Upload } from 'lucide-react';

export const compressImage = (file: File): Promise<string> => {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 800;
        const MAX_HEIGHT = 800;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.6));
      };
    };
  });
};

export default function ImageEvidenceInput({ 
  label, 
  images, 
  onChange,
  icon: Icon = Camera
}: { 
  label: string, 
  images: string[], 
  onChange: (images: string[]) => void,
  icon?: any
}) {
  const [uploading, setUploading] = useState(false);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    setUploading(true);
    const newImages = [...images];
    
    for (let i = 0; i < files.length; i++) {
      try {
        const compressed = await compressImage(files[i]);
        newImages.push(compressed);
      } catch (err) {
        console.error("Compression error:", err);
      }
    }
    
    onChange(newImages);
    setUploading(false);
    e.target.value = ''; // Reset input
  };

  const removeImage = (index: number) => {
    onChange(images.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-xs font-bold text-gray-500 uppercase">{label}</label>
        <label className="cursor-pointer text-blue-600 hover:text-blue-700 flex items-center gap-1 text-[10px] font-bold">
          <PlusCircle size={14} /> 
          {uploading ? 'Đang nén...' : 'Thêm ảnh'}
          <input 
            type="file" 
            accept="image/*" 
            multiple 
            className="hidden" 
            onChange={handleFileChange}
            disabled={uploading}
          />
        </label>
      </div>
      
      <div className="flex flex-wrap gap-2">
        {images.map((img, idx) => (
          <div key={idx} className="relative group w-16 h-16 rounded-lg overflow-hidden border border-gray-200 bg-gray-50">
            <img src={img} alt="Evidence" className="w-full h-full object-cover" />
            <button
              type="button"
              onClick={() => removeImage(idx)}
              className="absolute top-0.5 right-0.5 bg-red-500 text-white p-0.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <Trash2 size={10} />
            </button>
          </div>
        ))}
        {images.length === 0 && !uploading && (
          <p className="text-[10px] text-gray-400 italic">Chưa có ảnh minh chứng.</p>
        )}
        {uploading && (
          <div className="w-16 h-16 rounded-lg border border-dashed border-blue-300 flex items-center justify-center bg-blue-50 animate-pulse">
            <Upload size={16} className="text-blue-400" />
          </div>
        )}
      </div>
      <p className="text-[8px] text-gray-400">Tối đa 1MB/báo cáo. Ảnh sẽ được tự động nén.</p>
    </div>
  );
}
