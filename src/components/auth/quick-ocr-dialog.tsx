"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useForm, useFieldArray, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import Image from "next/image";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, UploadCloud, Camera, ArrowLeft } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { extractCustomerFromForm } from "@/ai/flows/extract-customer-from-form";
import { createManualCustomer } from "@/app/actions/leader";
import { getAssignableUsers } from "@/app/actions/user";
import { compressImageToDataUri } from "@/lib/image-compress";
import type { UserProfile } from "@/types";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

const FormAnswerSchema = z.object({
  question: z.string(),
  answer: z.string(),
});

const QuickOcrSchema = z.object({
  name: z.string().optional(),
  email: z.string().email("Email tidak valid.").optional().or(z.literal("")),
  phone: z.string().optional(),
  company: z.string().optional(),
  jobTitle: z.string().optional(),
  assignedSalesId: z.string({
    required_error: "Anda harus memilih nama Anda.",
  }),
  salesNoteName: z.string().optional(),
  creatorTeam: z.enum(["AEC", "MFG"], {
    required_error: "Tim pengguna harus ditentukan.",
  }),
  formAnswers: z.array(FormAnswerSchema).optional(),
});

type FormData = z.infer<typeof QuickOcrSchema>;

interface QuickOcrDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
}

export function QuickOcrDialog({ isOpen, onOpenChange }: QuickOcrDialogProps) {
  const [status, setStatus] = useState<
    "idle" | "reading" | "mapping" | "saving" | "camera"
  >("idle");
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [assignableUsers, setAssignableUsers] = useState<UserProfile[]>([]);
  const [hasCameraPermission, setHasCameraPermission] = useState<
    boolean | null
  >(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { toast } = useToast();

  const form = useForm<FormData>({
    resolver: zodResolver(QuickOcrSchema),
    defaultValues: {
      formAnswers: [],
    },
  });

  const { fields: formAnswerFields, replace: replaceFormAnswers } =
    useFieldArray({
      control: form.control,
      name: "formAnswers",
    });

  const stopCamera = useCallback(() => {
    if (videoRef.current?.srcObject) {
      (videoRef.current.srcObject as MediaStream)
        .getTracks()
        .forEach((track) => track.stop());
      videoRef.current.srcObject = null;
    }
  }, []);

  const resetState = useCallback(() => {
    setStatus("idle");
    setImagePreview(null);
    stopCamera();
    form.reset();
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, [form, stopCamera]);

  const handleClose = () => {
    if (status === "saving") return;
    onOpenChange(false);
  };

  // Effect to reset state when dialog closes
  useEffect(() => {
    if (!isOpen) {
      const timer = setTimeout(() => {
        resetState();
      }, 300); // Delay reset to allow for closing animation
      return () => clearTimeout(timer);
    }
  }, [isOpen, resetState]);

  const processImage = useCallback(
    async (imageDataUri: string) => {
      try {
        const compressed = await compressImageToDataUri(imageDataUri);
        const result = await extractCustomerFromForm({ imageDataUri: compressed });

        form.reset({
          ...form.getValues(), // Keep selected user and team
          name: result.name || "",
          company: result.company || "",
          jobTitle: result.jobTitle || "",
          email: result.email || "",
          phone: result.phone || "",
          formAnswers: result.formAnswers || [],
        });
        replaceFormAnswers(result.formAnswers || []);
        setStatus("mapping");
      } catch (error) {
        toast({
          variant: "destructive",
          title: "Gagal Ekstraksi OCR",
          description:
            error instanceof Error
              ? error.message
              : "Terjadi kesalahan tidak diketahui.",
        });
        resetState();
      }
    },
    [form, resetState, toast, replaceFormAnswers],
  );

  const handleFileChange = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setStatus("reading");
    setImagePreview(URL.createObjectURL(file));

    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onloadend = async () => {
      const imageDataUri = reader.result as string;
      await processImage(imageDataUri);
    };
  };

  const handleCaptureImage = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const videoEl = videoRef.current;
    if (!videoEl.videoWidth) {
      toast({
        variant: "destructive",
        title: "Kamera Belum Siap",
        description: "Tunggu hingga tampilan kamera muncul, lalu coba lagi.",
      });
      return;
    }
    setStatus("reading");
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext("2d");
    if (context) {
      context.drawImage(video, 0, 0, video.videoWidth, video.videoHeight);
      const imageDataUri = canvas.toDataURL("image/jpeg");
      setImagePreview(imageDataUri);
      stopCamera(); // Stop camera after capture
      processImage(imageDataUri);
    }
  };

  const onSubmit = async (data: FormData) => {
    const selectedUser = assignableUsers.find(
      (s) => s.uid === data.assignedSalesId,
    );
    if (!selectedUser) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Pengguna yang dipilih tidak valid.",
      });
      return;
    }

    setStatus("saving");

    const isLeaderAssigningToSelf = selectedUser.role === "Leader";

    try {
      await createManualCustomer({
        name: data.name || "",
        email: data.email,
        phone: data.phone,
        company: data.company,
        jobTitle: data.jobTitle,
        creatorTeam: data.creatorTeam,
        assignedSalesId: isLeaderAssigningToSelf ? null : selectedUser.uid,
        assignedSalesName: isLeaderAssigningToSelf ? null : selectedUser.name,

        acquisitionContext: {
          source: "OCR",
          eventName: "Quick OCR Scan",
          eventDate: new Date(),
        },
        products: [],
        notes: data.salesNoteName
          ? `Kontak dari: ${data.salesNoteName}`
          : undefined,
        formAnswers: data.formAnswers,
      });

      toast({
        title: "Sukses!",
        description: `Pelanggan "${data.name}" berhasil dibuat.`,
      });
      handleClose();
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Gagal Menyimpan Pelanggan",
        description:
          error instanceof Error
            ? error.message
            : "Terjadi kesalahan tidak diketahui.",
      });
      setStatus("mapping");
    }
  };

  useEffect(() => {
    if (isOpen) {
      getAssignableUsers()
        .then(setAssignableUsers)
        .catch(() => {
          toast({
            variant: "destructive",
            title: "Gagal Memuat Pengguna",
            description: "Tidak dapat memuat daftar sales dan leader.",
          });
        });
    }

    if (isOpen && status === "camera") {
      const getCameraPermission = async () => {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({
            video: {
              facingMode: "environment",
            },
          });
          setHasCameraPermission(true);
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            videoRef.current.play().catch(() => {});
          }
        } catch (error) {
          console.error("Error accessing camera:", error);
          setHasCameraPermission(false);
        }
      };
      getCameraPermission();
    } else {
      stopCamera();
    }

    return () => {
      stopCamera();
    };
  }, [isOpen, status, stopCamera, toast]);

  const handleUserChange = (userId: string) => {
    const selectedUser = assignableUsers.find((u) => u.uid === userId);
    if (selectedUser) {
      form.setValue("assignedSalesId", userId);
      form.setValue("creatorTeam", selectedUser.team);
    }
  };

  const renderContent = () => {
    switch (status) {
      case "camera":
        return (
          <div className="flex flex-col items-center justify-center space-y-4 min-h-[400px]">
            {hasCameraPermission === false ? (
              <Alert variant="destructive">
                <AlertTitle>Akses Kamera Ditolak</AlertTitle>
                <AlertDescription>
                  Izinkan akses kamera di pengaturan browser Anda untuk
                  menggunakan fitur ini.
                </AlertDescription>
              </Alert>
            ) : (
              <>
                <div className="w-full max-w-[280px] aspect-[9/16] bg-black rounded-lg overflow-hidden relative">
                  <video
                    ref={videoRef}
                    className="w-full h-full object-cover"
                    autoPlay
                    muted
                    playsInline
                  />
                  <div className="absolute inset-0 border-4 md:border-[1rem] border-black/30 rounded-lg box-border"></div>
                </div>
                <Button onClick={handleCaptureImage}>Ambil Gambar</Button>
              </>
            )}
            <Button variant="outline" onClick={() => setStatus("idle")}>
              <ArrowLeft className="mr-2 h-4 w-4" /> Kembali
            </Button>
          </div>
        );
      case "idle":
        return (
          <div className="flex flex-col items-center justify-center border-2 border-dashed border-muted-foreground/30 rounded-lg p-12 space-y-4 min-h-[400px]">
            <p className="text-muted-foreground text-center">
              Unggah foto kartu nama atau formulir, atau gunakan kamera untuk
              memindai.
            </p>
            <div className="flex flex-col sm:flex-row gap-4">
              <Button
                type="button"
                onClick={() => fileInputRef.current?.click()}
              >
                <UploadCloud className="mr-2 h-4 w-4" /> Pilih Gambar
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setStatus("camera")}
              >
                <Camera className="mr-2 h-4 w-4" /> Gunakan Kamera
              </Button>
            </div>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept="image/png, image/jpeg, image/webp"
              className="hidden"
            />
          </div>
        );
      case "reading":
        return (
          <div className="flex flex-col items-center justify-center min-h-[400px]">
            <Loader2 className="w-12 h-12 animate-spin text-primary" />
            <p className="mt-4 text-muted-foreground">
              AI sedang memindai dokumen...
            </p>
          </div>
        );
      case "mapping":
      case "saving":
        return (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
            <div className="space-y-4">
              <div className="relative w-full aspect-[9/16] rounded-md overflow-hidden border bg-muted">
                {imagePreview && (
                  <Image
                    src={imagePreview}
                    alt="Preview Dokumen"
                    fill
                    objectFit="contain"
                  />
                )}
              </div>
            </div>

            <form
              id="quick-ocr-form"
              onSubmit={form.handleSubmit(onSubmit)}
              className="space-y-3 overflow-y-auto max-h-[60vh] pr-2"
            >
              <p className="text-sm text-muted-foreground col-span-full">
                Verifikasi hasil pindaian AI dan pilih nama Anda sebagai pemilik
                kontak ini.
              </p>
              <div>
                <Label htmlFor="assignedSalesId">
                  Nama Anda (Pemilik Kontak)
                </Label>
                <Select
                  onValueChange={handleUserChange}
                  defaultValue={form.getValues("assignedSalesId")}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Pilih nama Anda..." />
                  </SelectTrigger>
                  <SelectContent>
                    {assignableUsers.map((s) => (
                      <SelectItem key={s.uid} value={s.uid}>
                        {s.name} ({s.role})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {form.formState.errors.assignedSalesId && (
                  <p className="text-xs text-destructive mt-1">
                    {form.formState.errors.assignedSalesId.message}
                  </p>
                )}
                {form.formState.errors.creatorTeam && (
                  <p className="text-xs text-destructive mt-1">
                    {form.formState.errors.creatorTeam.message}
                  </p>
                )}
              </div>
              <div>
                <Label htmlFor="salesNoteName">Catatan (Optional)</Label>
                <Input
                  id="salesNoteName"
                  {...form.register("salesNoteName")}
                  placeholder="Catatan (Optional)"
                  disabled={status === "saving"}
                />
              </div>
              <div>
                <Label htmlFor="name">Nama Kontak</Label>
                <Input
                  id="name"
                  {...form.register("name")}
                  disabled={status === "saving"}
                />
              </div>
              <div>
                <Label htmlFor="company">Perusahaan</Label>
                <Input
                  id="company"
                  {...form.register("company")}
                  disabled={status === "saving"}
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <Label htmlFor="jobTitle">Jabatan</Label>
                  <Input
                    id="jobTitle"
                    {...form.register("jobTitle")}
                    disabled={status === "saving"}
                  />
                </div>
                <div>
                  <Label htmlFor="phone">No. Telepon</Label>
                  <Input
                    id="phone"
                    {...form.register("phone")}
                    disabled={status === "saving"}
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  {...form.register("email")}
                  disabled={status === "saving"}
                />
              </div>
              <div className="col-span-2 space-y-3 pt-2">
                <Label className="font-medium">Jawaban Form</Label>
                {formAnswerFields.map((field, index) => {
                  const isPriorityField = field.question
                    .toLowerCase()
                    .includes("prioritas");
                  return (
                    <div key={field.id} className="space-y-1">
                      <Label
                        htmlFor={`form-q-${index}`}
                        className="text-xs text-muted-foreground"
                      >
                        {field.question}
                      </Label>
                      {isPriorityField ? (
                        <Controller
                          control={form.control}
                          name={`formAnswers.${index}.answer`}
                          render={({ field: controllerField }) => (
                            <Select
                              onValueChange={controllerField.onChange}
                              value={controllerField.value}
                              disabled={status === "saving"}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Pilih prioritas..." />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">(Kosong)</SelectItem>
                                <SelectItem value="Low">Low</SelectItem>
                                <SelectItem value="Medium">Medium</SelectItem>
                                <SelectItem value="High">High</SelectItem>
                              </SelectContent>
                            </Select>
                          )}
                        />
                      ) : (
                        <Input
                          id={`form-q-${index}`}
                          {...form.register(`formAnswers.${index}.answer`)}
                          disabled={status === "saving"}
                        />
                      )}
                    </div>
                  );
                })}
                {formAnswerFields.length === 0 && (
                  <p className="text-xs text-center text-muted-foreground py-2 border rounded-md">
                    Tidak ada jawaban form yang terdeteksi.
                  </p>
                )}
              </div>
            </form>
          </div>
        );
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-4xl grid-rows-[auto_1fr_auto]">
        <DialogHeader>
          <DialogTitle>Pindai Cepat</DialogTitle>
          <DialogDescription>
            Unggah gambar, pilih nama Anda, dan kontak akan langsung dibuat.
            Jika Anda seorang Leader, kontak akan masuk ke daftar "Belum
            Ditugaskan".
          </DialogDescription>
        </DialogHeader>

        <div
          className="py-4 pr-3 overflow-y-auto"
          style={{ maxHeight: "75vh" }}
        >
          <canvas ref={canvasRef} className="hidden" />
          {renderContent()}
        </div>

        <DialogFooter>
          {status !== "idle" && status !== "camera" && (
            <Button
              type="button"
              variant="ghost"
              onClick={resetState}
              disabled={status === "saving" || status === "reading"}
            >
              Pindai Lagi
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            onClick={handleClose}
            disabled={status === "saving"}
          >
            Tutup
          </Button>
          {(status === "mapping" || status === "saving") && (
            <Button
              type="submit"
              form="quick-ocr-form"
              disabled={status === "saving"}
            >
              {status === "saving" && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Simpan Kontak
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
