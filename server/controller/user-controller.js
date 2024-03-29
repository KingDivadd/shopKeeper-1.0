const asyncHandler = require('express-async-handler')
const { StatusCodes } = require('http-status-codes')
const User = require("../models/user-model")
const Auth = require("../models/auth-model")
const Branch = require("../models/branch-model")
const mongoose = require('mongoose')


// this should be restricted to only a few persons
const allUsers = asyncHandler(async(req, res) => {
    const loggedInUser = new mongoose.Types.ObjectId(req.info.id)
    const users = await User.find({ _id: { $ne: req.info.id.id } }).populate('branch', "location")
    if (!users) {
        res.status(500).json({ err: 'Error fetching all users!!!' })
    }
    res.status(StatusCodes.OK).json({ nbHit: users.length, users: users })
})

const filterUser = asyncHandler(async(req, res) => {
        const { firstName, lastName, branch, role } = req.body

        const branchExist = await Branch.findOne({ location: { $regex: new RegExp(branch, "i") } })
        const query = {}
        if (firstName) {
            query.firstName = { $regex: new RegExp(firstName, 'i') };
        }
        if (lastName) {
            query.lastName = { $regex: new RegExp(lastName, 'i') };
        }
        if (branchExist) {
            if (branch) {
                query.branch = branchExist._id;
            }
        }
        if (role) {
            query.role = { $regex: new RegExp(role, 'i') };
        }

        const users = await User.find(query).populate("branch", "location")
        if (!users.length) {
            return res.status(500).json({ err: `Error... No matching users found!!!` })
        }
        res.status(StatusCodes.OK).json({ nbHit: users.length, users: users })
    })
    // this is to fetch all the necessary info's partaining to this particular user.
    // check again later.
const oneUser = asyncHandler(async(req, res) => {
    const userExist = await User.findOne({ _id: req.info.id.id })
    if (!userExist) {
        return res.status(StatusCodes.NOT_FOUND).json({ err: `Error... user not found!!!` })
    }
    res.status(StatusCodes.OK).json({ userInfo: userExist })
})

const findUser = asyncHandler(async(req, res) => {
    const keyword = req.query.search ? {
        $or: [
            { name: { $regex: req.query.search, $options: 'i' } },
            { email: { $regex: req.query.search, $options: 'i' } }
        ]
    } : {}
    const findUser = await User.find(keyword).find({ _id: { $ne: req.info.id.id } })
    res.status(StatusCodes.OK).json({ nbHit: findUser.length, findUser })

})

const deBranchUser = asyncHandler(async(req, res) => {
    const { user_id } = req.body
    const userExist = await User.findOne({ _id: user_id })
    if (!userExist) {
        return res.status(404).json({ err: `Error... User with ID ${user_id} not found!!!` })
    }
    if (req.info.id.role !== 'admin') {
        return res.status(401).json({ err: `Error... ${req.info.id.name} you're not authorized to de-branch user!!` })
    }
    const updateUser = await User.findOneAndUpdate({ _id: user_id }, { $unset: { branch: 1 } }, { new: true, runValidators: true })
    return res.status(200).json({ msg: `${updateUser.name} has been successfully removed from his branch...`, newUserInfo: updateUser })
})

const updateUserInfo = asyncHandler(async(req, res) => {
    const { user_id, firstName, lastName, phone, role, branch } = req.body
        // only a logged in user should be able to change his name and phone
        // role can only be changed by the branch-manager and admin. however, a branch-manager cannot make another BM
        // branch can only be changed by the branch-manager

    const loggedInUser = await User.findOne({ _id: req.info.id.id }).populate('branch')
    const userExist = await User.findOne({ _id: user_id }).populate('branch')
    if (!userExist) {
        return res.status(StatusCodes.NOT_FOUND).json({ err: `User with ID ${user_id} not found!!!` })
    }
    const update = {}
        // for logged in user not admin or BM
    if (req.info.id.id === user_id) {
        if (firstName.trim() !== '') {
            update.firstName = firstName.trim()
        }
        if (lastName.trim() !== '') {
            update.lastName = lastName.trim()
        }
        if (phone.trim() !== '') {
            update.phone = phone.trim()
        }
    }
    // for the BM
    if (req.info.id.role === 'branch-manager') {
        // the BM cannot make changes to the CE0 and other BMs
        if ((userExist.role === 'branch-manager' && userExist._id.toString() !== req.info.id.id) || userExist.role === 'admin' || userExist.role === '') {
            return res.status(StatusCodes.UNAUTHORIZED).json({ err: `Error... You're not authorized to perform this operation!!!` })
        } else {
            // first check if the BM has as branch
            if (!loggedInUser.branch) {
                return res.status(500).json({ err: `Error... branch-manager without a branch cannot assign role` })
            }
            // should only be able to change the role of the staff in the same branch

            if (!userExist.branch) {
                // in this case only the admin should be allowed to work here.
                return res.status(200).json({ msg: `Selected user isn't under your jurisdiction, only admin can make changes!!!` })

            }

            if (userExist.branch && (loggedInUser.branch.location === userExist.branch.location)) {
                console.log("logLoc : ", loggedInUser.branch.location, "otherUser : ", userExist.branch.location)
                    // return res.status(StatusCodes.OK).send(userExist)

                if (role && userExist.role === "branch-manager") {
                    return res.status(StatusCodes.UNAUTHORIZED).json({ err: `Error... You are not authorized to change the role of a branch-manager in your branch` })
                }
                if (role.trim() !== '') {
                    if (role !== 'admin') {
                        update.role = role.trim()
                    }
                    console.log("admin nah")
                }
                if (firstName.trim() !== '') {
                    update.firstName = firstName.trim()
                }
                if (lastName.trim() !== '') {
                    update.lastName = lastName.trim()
                }
            } else {
                return res.status(401).json({ err: `You can only make changes to staff's info under your jurisdiction!!!` })
            }
            // return res.status(StatusCodes.UNAUTHORIZED).json({ err: `Error... Cannot make changes beyond your jurisdiction!!!` })
        }
    }
    // for the admin
    if (req.info.id.role === 'admin') {
        // admin can assign branch to anyone
        if (firstName.trim() !== '') {
            update.firstName = firstName.trim()
        }
        if (lastName.trim() !== '') {
            update.lastName = lastName.trim()
        }
        if (phone.trim() !== '') {
            update.phone = phone.trim()
        }
        // check if entered branch exist
        if (branch) {
            const branchExist = await Branch.findOne({ location: branch.toUpperCase() })
            if (!branchExist) {
                return res.status(StatusCodes.NOT_FOUND).json({ err: `Error... Unregistered Branch entered!!!` })
            }
            update.branch = branchExist._id
        }
        if (role.trim() !== '') {
            update.role = role.trim()
        }
    }
    const updateUser = await User.findOneAndUpdate({ _id: user_id }, { $set: update }, { new: true, runValidators: true })
    if (!updateUser) {
        return res.status(500).json({ err: `Error... Unable to update user info` })
    }
    res.status(StatusCodes.OK).json({ msg: `User updated successfully`, userInfo: updateUser })
})

const removeUser = asyncHandler(async(req, res) => {
    const { id: user_id } = req.body
    const userExist = await User.findOne({ _id: user_id })
    if (!userExist) {
        return res.status(StatusCodes.NOT_FOUND).json({ err: `User with ID ${user_id} not found!!!` })
    }

    if (req.info.id.role === 'admin') {
        const deleteUser = await User.findOneAndDelete({ _id: user_id })
        if (!deleteUser) {
            return res.status(500).json({ err: "Error... Unable to delete user!!!" })
        }
        const deleteUserAuth = await Auth.findOneAndDelete({ userId: user_id })
        if (!deleteUserAuth) {
            return res.status(500).json({ err: "Error... Unable to delete user auth!!!" })
        }
    }

    if (req.info.id.role === 'branch-manager') {
        // ensure the branch-manager only deletes user within his jurisdiction.
        const loggedInUser = await User.findOne({ _id: req.info.id.id })
        if (!userExist.branch) {
            const deleteUser = await User.findOneAndDelete({ _id: user_id })
            if (!deleteUser) {
                return res.status(500).json({ err: "Error... Unable to delete user!!!" })
            }
            const deleteUserAuth = await Auth.findOneAndDelete({ userId: user_id })
            if (!deleteUserAuth) {
                return res.status(500).json({ err: "Error... Unable to delete user auth!!!" })
            }
        } else {
            if (userExist.branch.location !== loggedInUser.branch.location) {
                return res.status(StatusCodes.UNAUTHORIZED).json({ err: `Error... Cannot delete user not in your branch` })
            }
            const deleteUser = await User.findOneAndDelete({ _id: user_id })
            if (!deleteUser) {
                return res.status(500).json({ err: "Error... Unable to delete user!!!" })
            }
            const deleteUserAuth = await Auth.findOneAndDelete({ userId: user_id })
            if (!deleteUserAuth) {
                return res.status(500).json({ err: "Error... Unable to delete user auth!!!" })
            }
        }
    }
    res.status(StatusCodes.OK).json({ msg: ` has been removed from the app`, deletedUser: deleteUser })
})

module.exports = { allUsers, oneUser, updateUserInfo, removeUser, findUser, filterUser, deBranchUser }