"use client";
import { PostPage } from "@/app/(main)/_components/for-you-posts";
import { useSession } from "@/app/(main)/_providers/session-provider";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";
import {
  InfiniteData,
  QueryFilters,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import Placeholder from "@tiptap/extension-placeholder";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useDropzone } from "@uploadthing/react";
import EmojiPicker, { EmojiClickData } from "emoji-picker-react";
import { ImageIcon, Loader2, SmilePlus, X } from "lucide-react";
import Image from "next/image";
import { ClipboardEvent, memo, useCallback, useRef, useState } from "react";
import { createPost } from "./actions";
import "./styles.css";
import useMediaUpload, { Attachement } from "./use-media-upload";

interface Props {}

const PostEditor = ({}: Props) => {
  //auth
  const { user } = useSession();
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  const {
    startUpload,
    attachements,
    isUploading,
    removeAttachment,
    reset: resetMediaUploads,
    uploadProgress,
  } = useMediaUpload();

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: startUpload,
  });

  const { onClick, ...rootProp } = getRootProps();

  //Editor Configrations
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        bold: false,
        italic: false,
      }),
      Placeholder.configure({
        placeholder: "What's in your mind ?",
      }),
    ],
    content: "",
  });

  //Input
  let input =
    editor?.getText({
      blockSeparator: "\n",
    }) || "";

  //toast trigger
  const { toast } = useToast();

  //gettting query client
  const queryClient = useQueryClient();

  //Mutation for Invalidating and creating new cache data with new post
  const mutation = useMutation({
    mutationFn: createPost,
    onSuccess: async ({ newPost }) => {
      editor?.commands.clearContent();
      resetMediaUploads();

      const queryFilter: QueryFilters = {
        queryKey: ["posts"],
        predicate: (query) => {
          const queryData = query.state.data as InfiniteData<PostPage, string | null> | undefined;
          return ((query.queryKey.includes("for-you")) || (query.queryKey.includes("user-posts") && query.queryKey.includes(user.id))); 
        },
      };

      await queryClient.cancelQueries(queryFilter);

      queryClient.setQueriesData<InfiniteData<PostPage, string | null>>(
        { queryKey: ["posts"] }, 
        (oldData) => {
          if (!oldData) return oldData; 

          const firstPage = oldData.pages[0];

          return {
            pageParams: oldData.pageParams,
            pages: [
              {
                posts: [newPost, ...firstPage.posts],
                nextCursor: firstPage.nextCursor,
              },
              ...oldData.pages.slice(1),
            ],
          };
        }
      );

      queryClient.invalidateQueries({
        queryKey: queryFilter.queryKey,
        predicate: (query) => {
          
          return queryFilter.predicate ? queryFilter.predicate(query) && !query.state.data : true;
        },
      });

      toast({
        variant: "default",
        description: "Post created successfully!",
      });
    },
    onError: (err) => {
      console.log(err);
      toast({
        variant: "destructive",
        description: "Failed to create post. Please try again.",
      });
    },
  });

  //Submit Handler
  const handleSubmit = async () => {
    if (!input) return;
    mutation.mutate({
      content: input,
      mediaIds: attachements.map((a) => a.mediaId).filter(Boolean) as string[],
    });
  };

  
  const onPaste = useCallback(
    async (e: ClipboardEvent<HTMLElement>) => {
      const files = Array.from(e.clipboardData.items)
        .filter((file) => file.kind === "file")
        .map((file) => file.getAsFile()) as File[];
      if (files.length > 0) {
        startUpload(files);
      }
    },
    [startUpload]
  );

  const onEmojiClick = (emojiObject: EmojiClickData) => {
    if (editor) {
      editor.chain().focus().insertContent(emojiObject.emoji).run();
    }
  };

  return (
    <div className="flex flex-col gap-5 rounded-2xl bg-card p-5 shadow-md dark:border">
      <div className="flex items-start justify-start gap-3">
        <Avatar className="max-h-[40px] min-h-[40px] min-w-[40px] max-w-[40px]">
          <AvatarImage src={user.avatarUrl || ""} alt={user.displayName} />
          <AvatarFallback>{user.displayName[0].toUpperCase()}{user.displayName[1].toUpperCase()}</AvatarFallback>
        </Avatar>
        <div {...rootProp} className={`w-full`}>
          <EditorContent
            editor={editor}
            onPaste={onPaste}
            className={`max-h-[20rem] w-full overflow-y-auto rounded-lg border bg-gray-100 px-4 py-2.5 text-sm outline-none ring-0 dark:bg-black ${
              isDragActive &&
              "border !bg-gray-200 dark:!bg-[#181818] !outline-dashed"
            }`}
          />
          <input {...getInputProps()} />
        </div>
      </div>
      {!!attachements.length && (
        <AttachemntsBox
          attachments={attachements}
          removeAttachment={removeAttachment}
        />
      )}
      <div className="flex w-full items-center justify-end gap-2">
        {isUploading && (
          <div className="flex items-center justify-center gap-2">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <p className="text-sm">{uploadProgress ?? 0} %</p>
          </div>
        )}
        <div className="flex items-center">
          <AddAttachmentsButton
            onFilesSelected={startUpload}
            disabled={isUploading || attachements.length >= 5}
          />
          <DropdownMenu
            open={showEmojiPicker}
            onOpenChange={setShowEmojiPicker}
          >
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant={"ghost"}
                size={"icon"}
                onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                className="relative cursor-pointer hover:text-primary dark:text-white dark:hover:text-primary"
                disabled={mutation.isPending}
              >
                <SmilePlus className="text-primary" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-fit !p-0 shadow-lg" align="end">
              <EmojiPicker onEmojiClick={onEmojiClick} />
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <Button
          type="button"
          loading={mutation.isPending}
          loadingText="Posting"
          className="dark:text-white"
          disabled={!input || mutation.isPending || isUploading}
          onClick={handleSubmit}
        >
          Post
        </Button>
      </div>
    </div>
  );
};

export default PostEditor;

interface AddAttachmentsButtonProps {
  onFilesSelected: (files: File[]) => void;
  disabled: boolean;
}

const AddAttachmentsButton = ({
  onFilesSelected,
  disabled,
}: AddAttachmentsButtonProps) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <>
      <Button
        variant={"ghost"}
        size={"icon"}
        className="text-primary hover:text-primary"
        onClick={() => fileInputRef.current?.click()}
      >
        <ImageIcon />
      </Button>
      <input
        type="file"
        ref={fileInputRef}
        accept="image/*, video/*"
        multiple
        className="sr-only hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files || []);
          if (files.length) {
            onFilesSelected(files);
          }
          e.target.value = "";
        }}
      />
    </>
  );
};

interface AttachemntsBoxProps {
  attachments: Attachement[];
  removeAttachment: (filename: string) => void;
}

const AttachemntsBox = memo(
  ({ attachments, removeAttachment }: AttachemntsBoxProps) => {
    return (
      <div
        className={cn(
          "flex flex-col gap-3",
          attachments.length > 1 && "sm:grid sm:grid-cols-2"
        )}
      >
        {attachments.map((attachment) => (
          <AttachmentPreview
            key={attachment.file.name}
            attachment={attachment}
            onRemoveClick={() => removeAttachment(attachment.file.name)}
          />
        ))}
      </div>
    );
  }
);

AttachemntsBox.displayName = "AttachemntsBox";

interface AttachemntsPrevProps {
  attachment: Attachement;
  onRemoveClick: () => void;
}

const AttachmentPreview = memo(
  ({
    attachment: { file, isUploading, mediaId },
    onRemoveClick,
  }: AttachemntsPrevProps) => {
    const src = URL.createObjectURL(file);
    return (
      <div
        className={cn("relative mx-auto w-full", isUploading && "opacity-50")}
      >
        {file.type.startsWith("image") ? (
          <Image
            src={src}
            alt={"Attachment preview"}
            width={500}
            height={500}
            className="aspect-square w-full rounded-2xl object-cover"
          />
        ) : (
          <video
            controls
            className="aspect-square h-full w-full rounded-2xl object-cover"
          >
            <source src={src} type={file.type} />
          </video>
        )}
        {!isUploading && (
          <button
            onClick={onRemoveClick}
            type="button"
            className="absolute right-3 top-3 rounded-full bg-foreground p-1.5 text-background transition-colors hover:bg-foreground/60"
          >
            <X size={20} />
          </button>
        )}
      </div>
    );
  }
);

AttachmentPreview.displayName = "AttachmentPreview";