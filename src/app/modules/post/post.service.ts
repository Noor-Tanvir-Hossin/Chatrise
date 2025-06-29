import mongoose from "mongoose";
import AppError from "../../error/AppError";
import { StatusCodes } from "http-status-codes";
import sharp from 'sharp'
import { Express } from 'express';
import { cloudinary, uploadToCloudinary } from "../../utils/cloudinary";
import { Post } from "./post.model";
import { User } from "../user/user.model";
import { Comment } from "../comment/comment.model";


const createPostIntoDB= async(caption:string, image:Express.Multer.File, userId:mongoose.Types.ObjectId)=>{

    if(!image){
        throw new AppError(StatusCodes.BAD_REQUEST,"Image is required for the post")
    }
    const optimizedImageBuffer= await sharp(image.buffer).resize({
        width:800,
        height:800,
        fit:"inside"
    }).toFormat('jpeg',{quality:80})
    .toBuffer()

    const fileUri= `data:image/jpeg;base64,${optimizedImageBuffer.toString("base64")}`
    const cloudResponse= await uploadToCloudinary(fileUri)
    let post = await Post.create({
        caption,
        image:{
            url:cloudResponse.secure_url,
            publicId:cloudResponse.public_id
        },
        user:userId
    })
    const user = await User.findById(userId)
    if(user){
        user.posts?.push(post.id)
        await user.save({validateBeforeSave:false})
    }
    post = await post.populate({
        path:'user',
        select:"name email bio profilePicture"
    })

    return post
    
}

const getAllPostFromDB=async()=>{
    const posts= await Post.find().populate({
        path:"user",
        select:'name profilePicture bio',
    })
    .populate({
        path: 'comments',
        select:"text user",
        populate:{
            path:'user',
            select:'name profilePicture'
        }
    }).sort({createdAt: -1})
    let postLength= posts.length
    return {posts, postLength}
}

const getSingleUserPostFromDB=async(id:string)=>{
    const post= await Post.find({user:id})
    .populate({
        path: 'comment',
        select:"text user",
        populate:{
            path:'user',
            select:'name profilePicture'
        }
    }).sort({createdAt: -1})
    
    return post
}

const saveOrUnsavePostIntoDB=async(userId:mongoose.Types.ObjectId, postId:string)=>{
    const user= await User.findById(userId)

    if(!user){
        throw new AppError(StatusCodes.NOT_FOUND,"User Not Found")
    }
    const postObjectId = new mongoose.Types.ObjectId(postId);

    const isPostSaved = user?.savePosts?.some(savedPostId => savedPostId.equals(postObjectId));

    if(isPostSaved){
        (user.savePosts as mongoose.Types.Array<mongoose.Types.ObjectId>).pull(postObjectId);
        await user.save({validateBeforeSave:false});

    }else{
        user?.savePosts?.push(postObjectId);
        await user.save({validateBeforeSave:false});
    }

    return {isPostSaved, user}
}

const deletePostFromDB=async(userId:mongoose.Types.ObjectId, postId:string)=>{
    const post=await Post.findById(postId).populate("user")

    if(!post){
        throw new AppError(StatusCodes.NOT_FOUND,"post Not Found")
    }
    
    if(post.user._id.toString() !== userId.toString()){
        throw new AppError(StatusCodes.UNAUTHORIZED,"You are not authorized to delete that post")
    }
    await User.updateOne({_id:userId}, {$pull:{posts:postId}})
    await User.updateMany({savePosts:postId }, {$pull:{savePosts:postId}})

    await Comment.deleteMany({post: postId})

    if(post?.image?.publicId){
        await cloudinary.uploader.destroy(post.image.publicId)
    }
    await Post.findByIdAndDelete(postId)

}

const likeOrDislikePost=async(userId:mongoose.Types.ObjectId, postId:string)=>{
    const post = await Post.findById(postId)
    if(!post){
        throw new AppError(StatusCodes.NOT_FOUND,"post Not Found")
    }
    const isLiked = post.likes.includes(userId)
    if(isLiked){
        await Post.findByIdAndUpdate(
            postId,
            {$pull: {likes: userId}},
            {new:true}

        )
    }else{
        await Post.findByIdAndUpdate(
            postId,
            {$addToSet: {likes: userId}},
            {new:true}

        )
    }
    return {isLiked}
}

const addComment=async(userId:mongoose.Types.ObjectId, postId:string, comment: string)=>{
    const post = await Post.findById(postId)

    if(!post){
        throw new AppError(StatusCodes.NOT_FOUND,"post Not Found")
    }
    if(!comment){
        throw new AppError(StatusCodes.BAD_REQUEST,"Comment text is required")
    }

   const createComment= await Comment.create({
    text:comment,
    user: userId,
    createdAt:Date.now()
   })
   post.comments.push(createComment?._id as mongoose.Types.ObjectId)
   await post.save({validateBeforeSave:false})
   await createComment.populate({
    path:'user',
    select: "name profilePicture bio"
   })

   return createComment

}





export const postService={
    createPostIntoDB,
    getAllPostFromDB,
    getSingleUserPostFromDB,
    saveOrUnsavePostIntoDB,
    deletePostFromDB,
    likeOrDislikePost,
    addComment
}